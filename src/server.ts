import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import type { MirrorDataSource } from './adapter.js'
import type { Config, FilterRules } from './config.js'
import { isTopicVisible } from './config.js'
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

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DSH Mirror</title>
  <!-- vite-built assets are injected here by the build -->
  <script type="module" crossorigin src="/assets/index.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index.css">
</head>
<body>
  <div id="root"></div>
</body>
</html>
`

/**
 * Read-only mirror HTTP server on its own port. No auth, no write paths.
 * Only GET handlers are registered — there is no mechanism to mutate
 * anything through this surface.
 */
export class MirrorServer {
  private server: Server
  private sseClients = new Map<string, Set<ServerResponse>>()

  constructor(
    private config: Config,
    private source: MirrorDataSource,
    private rules: FilterRules,
  ) {
    this.server = createServer((req, res) => this.handle(req, res))
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, () => resolve())
      this.server.once('error', reject)
    })
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405, { allow: 'GET' })
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const path = url.pathname

    try {
      if (path === '/') {
        res.writeHead(200, HTML_HEADERS)
        res.end(INDEX_HTML)
        return
      }
      // Static vite build assets
      if (path.startsWith('/assets/')) {
        await this.serveStatic(path, res)
        return
      }
      if (path === '/topics') {
        await this.handleTopics(res)
        return
      }
      const historyMatch = path.match(/^\/topics\/([^/]+)\/history$/)
      if (historyMatch) {
        await this.handleHistory(historyMatch[1]!, res)
        return
      }
      const eventsMatch = path.match(/^\/topics\/([^/]+)\/events$/)
      if (eventsMatch) {
        await this.handleEvents(eventsMatch[1]!, req, res)
        return
      }
      send404(res)
    } catch {
      sendJson(res, 500, { error: 'Internal server error' })
    }
  }

  private async serveStatic(path: string, res: ServerResponse): Promise<void> {
    try {
      const { readFile } = await import('node:fs/promises')
      const { join, resolve } = await import('node:path')
      const { fileURLToPath } = await import('node:url')
      const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../dist/client')
      const filePath = join(root, path)
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

  private async handleHistory(topicId: string, res: ServerResponse): Promise<void> {
    if (!isTopicVisible(topicId, this.rules)) {
      send404(res)
      return
    }
    const events = await this.source.getEvents(topicId)
    const body: HistoryResponse = { topicId, events }
    sendJson(res, 200, body)
  }

  private async handleEvents(topicId: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isTopicVisible(topicId, this.rules)) {
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
