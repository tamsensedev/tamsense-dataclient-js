export interface Rect {
    x: number
    y: number
    w: number
    h: number
}

export interface SerializedNode {
    id: number
    tag: string
    text?: string
    icon?: string
    attrs?: Record<string, string>
    rect?: Rect
    children?: number[]
}

export interface Viewport {
    scrollX: number
    scrollY: number
    width: number
    height: number
}

export interface SnapshotEvent {
    event: 'snapshot'
    timestamp: string
    url: string
    title: string
    tree: SerializedNode[]
    viewport: Viewport
}

export interface MutationEvent {
    event: 'mutation'
    timestamp: string
    url: string
    adds: MutationAdd[]
    removes: number[]
    text_changes: TextChange[]
    attr_changes: AttrChange[]
}

export interface MutationAdd {
    parentId: number
    nodes: SerializedNode[]
}

export interface TextChange {
    id: number
    text: string
}

export interface AttrChange {
    id: number
    attr: string
    value: string | null
}

export interface ActionEvent {
    event: 'action'
    timestamp: string
    type: 'click' | 'input' | 'change'
    targetId: number | null
    tag: string
    text: string
    url: string
    value?: string
    length?: number
    checked?: boolean | null
    state?: string
    viewport: Viewport
}

export interface IdentifyEvent {
    event: 'identify'
    timestamp: string
    user_id: string
}

export interface ExcludeEvent {
    event: 'exclude'
    timestamp: string
    reason: string
}

export interface RrwebEvent {
    event: 'rrweb'
    timestamp: string
    rrwebEvent: { type: number, [key: string]: unknown }
}

export type SceneEvent = SnapshotEvent | MutationEvent | ActionEvent | RrwebEvent | IdentifyEvent | ExcludeEvent

export interface Config {
    endpoint: string
    debug: boolean | 'verbose'
    batchSize: number
    flushInterval: number
    checkpointInterval: number
    idleTimeout: number
    mutationDebounce: number
    inputDebounce: number
    sessionIdKey: string
    deviceIdKey: string
    apiKey: string
}

export interface Tracker {
    start: () => void
    stop: () => void
    beforeUnload?: () => void
    markMutation?: () => void
}

export interface SceneBatch {
    session_id: string
    device_id: string
    events: SceneEvent[]
    sent_at: string
    page_url: string
    user_agent: string
    screen: {
        width: number
        height: number
        viewport_width: number
        viewport_height: number
    }
}
