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
