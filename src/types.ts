/**
 * Mirror-layer event: the decoupled intermediate shape (Q14).
 *
 * The adapter translates DSH's SessionWireEvent into this stable form —
 * the server and client only ever see MirrorEvent, so if the upstream
 * wire format evolves, only the adapter needs to change.
 */
export interface MirrorEvent {
  /** Monotonic sequence within the topic (session). */
  seq: number
  /** Event timestamp, epoch ms. */
  time: number
  /**
   * Event classification from DSH SessionEventMap:
   * 'turn/start' | 'turn/end' | 'step/start' | 'step/end' |
   * 'user/message' | 'assistant/chunk' | 'assistant/message' |
   * 'tool/call' | 'tool/result' | 'chunkrow/*' | ...
   */
  kind: string
  /** Payload, kept as raw JSON. Shape depends on `kind`. */
  data: unknown
}

/** One mirrorable conversation (= one DSH session). */
export interface MirrorTopic {
  /** Stable id: the sessionId. */
  id: string
  /** Human label (session title or cwd-derived name). */
  title: string
  /** Owning workspace, when the session belongs to one. */
  workspaceId: string | undefined
  /** Workspace path, when available. */
  workspacePath: string | undefined
  /** Epoch ms of the last event, for sorting. */
  updatedAt: number
  /** Whether the session is live (in-memory) or cold (persisted). */
  running: boolean
}

/** A workspace groups topics on the index page. */
export interface MirrorWorkspace {
  id: string
  path: string
  title: string
}

/** GET /topics response */
export interface TopicsResponse {
  workspaces: MirrorWorkspace[]
  topics: MirrorTopic[]
}

/** GET /topics/:id/history response */
export interface HistoryResponse {
  topicId: string
  events: MirrorEvent[]
}
