export interface MirrorEvent {
  seq: number
  time: number
  kind: string
  data: unknown
}

export interface MirrorTopic {
  id: string
  title: string
  workspaceId?: string
  workspacePath?: string
  updatedAt: number
  running: boolean
}

export interface MirrorWorkspace {
  id: string
  path: string
  title: string
}

export interface TopicsResponse {
  workspaces: MirrorWorkspace[]
  topics: MirrorTopic[]
}

export interface HistoryResponse {
  topicId: string
  events: MirrorEvent[]
}

/** Runtime-editable mirror filter config (mirrors server EditableConfig). */
export interface EditableConfig {
  include: string[]
  exclude: string[]
  events: { hide: string[]; show: string[] }
  tools: { hide: string[]; hideCalls: string[]; hideResults: string[] }
  redact: Array<{ pattern: string; replace: string }>
  sensitiveDefaults: boolean
}

/** GET /config response. */
export interface ConfigResponse {
  config: EditableConfig
  host: string
  port: number
  configFile: string
  defaults: {
    hiddenEventKinds: string[]
    redactRules: Array<{ pattern: string; replace: string }>
  }
}
