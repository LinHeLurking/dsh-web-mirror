import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MirrorDataSource } from './adapter.js'
import { DEFAULT_HIDDEN_EVENT_KINDS, DEFAULT_REDACT_RULES, isTopicVisible } from './config.js'
import type { MirrorConfigStore } from './runtime-config.js'
import type { TopicsResponse, HistoryResponse } from './types.js'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-cache',
} as const

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-cache',
} as const

const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
} as const

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

function send404(res: ServerResponse): void {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
}

function send405(res: ServerResponse, allow: string): void {
  res.writeHead(405, { allow })
  res.end()
}

/** Read a request body with a hard size cap (config payloads are tiny). */
function readBody(req: IncomingMessage, limit = 1_048_576): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        rejectPromise(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', rejectPromise)
  })
}

/** Directory holding the vite-built client (index.html + hashed assets). */
const CLIENT_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../dist/client')

/**
 * Mirror HTTP server on its own port. Session data is read-only; the only
 * write surface is /config, which mutates the mirror's own filter settings
 * (never DSH state) and persists them to a JSON file in the user's home.
 */
export class MirrorServer {
  private server: Server
  private sseClients = new Map<string, Set<ServerResponse>>()

  constructor(
    private store: MirrorConfigStore,
    private source: MirrorDataSource,
  ) {
    this.server = createServer((req, res) => this.handle(req, res))
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { host, port } = this.store.getConfig()
      this.server.listen(port, host, () => resolve())
      this.server.once('error', reject)
    })
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET'
    if (method !== 'GET' && method !== 'PUT' && method !== 'POST') {
      res.writeHead(405, { allow: 'GET, PUT, POST' })
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const path = url.pathname

    try {
      if (path === '/') {
        if (method !== 'GET') return send405(res, 'GET')
        await this.serveIndex(res)
        return
      }
      // Static vite build assets (content-hashed filenames)
      if (path.startsWith('/assets/')) {
        if (method !== 'GET') return send405(res, 'GET')
        await this.serveStatic(path, res)
        return
      }
      if (path === '/topics') {
        if (method !== 'GET') return send405(res, 'GET')
        await this.handleTopics(res)
        return
      }
      if (path === '/config') {
        if (method === 'GET') {
          this.handleGetConfig(res)
          return
        }
        if (method === 'PUT') {
          await this.handlePutConfig(req, res)
          return
        }
        return send405(res, 'GET, PUT')
      }
      if (path === '/config/reset') {
        if (method !== 'POST') return send405(res, 'POST')
        this.handleResetConfig(res)
        return
      }
      const historyMatch = path.match(/^\/topics\/([^/]+)\/history$/)
      if (historyMatch) {
        if (method !== 'GET') return send405(res, 'GET')
        await this.handleHistory(historyMatch[1]!, url.searchParams.get('after'), res)
        return
      }
      const eventsMatch = path.match(/^\/topics\/([^/]+)\/events$/)
      if (eventsMatch) {
        if (method !== 'GET') return send405(res, 'GET')
        await this.handleEvents(eventsMatch[1]!, req, res)
        return
      }
      send404(res)
    } catch {
      sendJson(res, 500, { error: 'Internal server error' })
    }
  }

  /** Serve the vite-built index.html, which references the hashed assets. */
  private async serveIndex(res: ServerResponse): Promise<void> {
    try {
      const data = await readFile(join(CLIENT_ROOT, 'index.html'))
      res.writeHead(200, HTML_HEADERS)
      res.end(data)
    } catch {
      send404(res)
    }
  }

  private async serveStatic(path: string, res: ServerResponse): Promise<void> {
    try {
      const filePath = normalize(join(CLIENT_ROOT, path))
      if (filePath !== CLIENT_ROOT && !filePath.startsWith(CLIENT_ROOT + sep)) {
        send404(res)
        return
      }
      const data = await readFile(filePath)
      const contentType = path.endsWith('.css')
        ? 'text/css'
        : path.endsWith('.js')
          ? 'application/javascript'
          : 'application/octet-stream'
      res.writeHead(200, { 'content-type': contentType })
      res.end(data)
    } catch {
      send404(res)
    }
  }

  private async handleTopics(res: ServerResponse): Promise<void> {
    const { workspaces, topics } = await this.source.listTopics()
    const body: TopicsResponse = { workspaces, topics }
    sendJson(res, 200, body)
  }

  /**
   * GET /config — the effective editable config plus the read-only context
   * the settings UI needs: listen address, the persisted-overrides file
   * location, and the built-in defaults (so the UI can display them).
   */
  private handleGetConfig(res: ServerResponse): void {
    const { host, port } = this.store.getConfig()
    sendJson(res, 200, {
      config: this.store.getEditable(),
      host,
      port,
      configFile: this.store.file,
      defaults: {
        hiddenEventKinds: DEFAULT_HIDDEN_EVENT_KINDS,
        redactRules: DEFAULT_REDACT_RULES,
      },
    })
  }

  /**
   * PUT /config — validate and apply a partial editable-config update.
   * Takes effect immediately (the rules getter is re-read per request)
   * and persists to the overrides file so it survives restarts.
   */
  private async handlePutConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { errors: ['Request body must be valid JSON'] })
      return
    }
    const result = this.store.update(body)
    if (!result.ok) {
      sendJson(res, 400, { errors: result.errors })
      return
    }
    sendJson(res, 200, { config: result.config })
  }

  /** POST /config/reset — drop UI overrides, revert to the yaml config. */
  private handleResetConfig(res: ServerResponse): void {
    const result = this.store.reset()
    if (!result.ok) {
      sendJson(res, 500, { errors: result.errors })
      return
    }
    sendJson(res, 200, { config: result.config })
  }

  private async handleHistory(topicId: string, afterParam: string | null, res: ServerResponse): Promise<void> {
    if (!isTopicVisible(topicId, this.store.rules)) {
      send404(res)
      return
    }
    // Incremental fetch: ?after=<seq> returns only events with seq > after.
    let after = 0
    if (afterParam !== null) {
      if (!/^\d+$/.test(afterParam)) {
        sendJson(res, 400, { error: 'Invalid `after` parameter: expected a non-negative integer' })
        return
      }
      after = Number(afterParam)
      if (!Number.isSafeInteger(after)) {
        sendJson(res, 400, { error: 'Invalid `after` parameter: expected a non-negative integer' })
        return
      }
    }
    const all = await this.source.getEvents(topicId)
    // Events arrive ordered by seq ascending — both the filter and the
    // latest seq read rely on that invariant.
    const events = afterParam === null ? all : all.filter((e) => e.seq > after)
    const latestSeq = all.length > 0 ? all[all.length - 1]!.seq : 0
    const body: HistoryResponse = { topicId, events, latestSeq }
    sendJson(res, 200, body)
  }

  private async handleEvents(topicId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isTopicVisible(topicId, this.store.rules)) {
      res.writeHead(404)
      res.end()
      return
    }
    res.writeHead(200, SSE_HEADERS)
    res.write(': connected\n\n')

    let clients = this.sseClients.get(topicId)
    if (!clients) {
      clients = new Set()
      this.sseClients.set(topicId, clients)
    }
    clients.add(res)

    req.on('close', () => {
      clients.delete(res)
      if (clients.size === 0) {
        this.sseClients.delete(topicId)
      }
    })
  }

  /** Notify SSE clients that a topic has new data. */
  notifyTopicChanged(topicId: string): void {
    const clients = this.sseClients.get(topicId)
    if (!clients) return
    const frame = `data: ${JSON.stringify({ type: 'changed', topicId })}\n\n`
    for (const res of clients) {
      try {
        res.write(frame)
      } catch {
        clients.delete(res)
      }
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      const closed = new Promise<void>((r) => this.server.close(() => r()))
      this.server.closeAllConnections()
      for (const clients of this.sseClients.values()) {
        for (const res of clients) res.destroy()
      }
      this.sseClients.clear()
      void closed.then(() => resolve())
    })
  }
}
