import type { SceneBatch, SceneEvent } from '../types'

const MAX_RETRIES = 2

const BEACON_MAX_SIZE = 60_000

const MAX_REQUEST_BYTES = 256 * 1024

const MAX_QUEUE_BYTES = 4 * 1024 * 1024

const MAX_STORED_BYTES = 1024 * 1024

const MAX_BACKOFF_MS = 30_000
const STORAGE_PREFIX = 'sc2_pending_'

type SendResult = 'ok' | 'retry' | 'drop'

export class Sender {
    private queue: SceneEvent[] = []
    private timer: ReturnType<typeof setInterval> | null = null
    private retryTimer: ReturnType<typeof setTimeout> | null = null
    private flushPromise: Promise<void> = Promise.resolve()
    private backoffMs = 0
    private nextAttemptAt = 0
    private storageKey: string

    constructor(
        private endpoint: string,
        private apiKey: string,
        private batchSize: number,
        private sessionId: string,
        private deviceId: string,
        flushInterval: number,
        private version?: string,
    ) {
        this.storageKey = `${STORAGE_PREFIX}${sessionId}`
        this.queue = this.loadStored()
        this.timer = setInterval(() => this.flush(), flushInterval)

        if (this.queue.length > 0) {
            this.flush()
        }
    }

    add(event: SceneEvent) {
        this.queue.push(event)

        const isRrwebSnapshot = event.event === 'rrweb'
            && event.rrwebEvent.type === 2

        if (isRrwebSnapshot || this.queue.length >= this.batchSize) {
            this.flush()
        }
    }

    flush() {
        this.flushPromise = this.flushPromise.then(() => this.doFlush())
    }

    flushSync() {
        if (this.queue.length === 0)
            return

        const entries = this.serialize(this.queue.splice(0))
        const beaconEvents: SceneEvent[] = []
        let bytes = 0

        for (const entry of entries) {
            if (bytes + entry.json.length > BEACON_MAX_SIZE)
                break
            beaconEvents.push(entry.event)
            bytes += entry.json.length
        }

        if (beaconEvents.length > 0) {
            this.sendBeacon(beaconEvents)
        }

        const leftover = entries.slice(beaconEvents.length).map(e => e.event)
        this.queue = leftover.concat(this.queue)
        this.store(leftover)
    }

    destroy() {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
            this.retryTimer = null
        }
        this.flushSync()
    }

    private async doFlush() {
        if (this.queue.length === 0 || Date.now() < this.nextAttemptAt)
            return

        const entries = this.trim(this.serialize(this.queue.splice(0)))
        const url = this.buildUrl()

        for (let i = 0; i < entries.length;) {
            const request: SceneEvent[] = []
            let bytes = 0

            while (i < entries.length && (request.length === 0 || bytes + entries[i]!.json.length <= MAX_REQUEST_BYTES)) {
                bytes += entries[i]!.json.length
                request.push(entries[i]!.event)
                i++
            }

            const result = await this.send(JSON.stringify(this.buildBatch(request)), url)

            if (result === 'retry') {
                const unsent = request.concat(entries.slice(i).map(e => e.event))
                this.queue = unsent.concat(this.queue)
                this.scheduleRetry()
                return
            }
        }

        this.backoffMs = 0
        this.nextAttemptAt = 0
        this.clearStored()
    }

    private scheduleRetry() {
        this.backoffMs = this.backoffMs === 0
            ? 1000
            : Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
        this.nextAttemptAt = Date.now() + this.backoffMs

        this.store(this.queue)

        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
        }
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null
            this.nextAttemptAt = 0
            this.flush()
        }, this.backoffMs)
    }

    private serialize(events: SceneEvent[]): { event: SceneEvent, json: string }[] {
        return events.map(event => ({ event, json: JSON.stringify(event) }))
    }

    private trim(entries: { event: SceneEvent, json: string }[]): { event: SceneEvent, json: string }[] {
        let total = 0
        for (const entry of entries) {
            total += entry.json.length
        }
        if (total <= MAX_QUEUE_BYTES) {
            return entries
        }

        let from = 0
        while (from < entries.length && total > MAX_QUEUE_BYTES) {
            total -= entries[from]!.json.length
            from++
        }
        return entries.slice(from)
    }

    private sendBeacon(events: SceneEvent[]) {
        const json = JSON.stringify(this.buildBatch(events))
        const url = this.buildUrl()

        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            const blob = new Blob([json], { type: 'application/json' })
            if (navigator.sendBeacon(url, blob))
                return
        }

        try {
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: json,
                keepalive: true,
            }).catch(() => {})
        }
        catch {}
    }

    private storage(): Storage | null {
        try {
            return typeof sessionStorage === 'undefined' ? null : sessionStorage
        }
        catch {
            return null
        }
    }

    private store(events: SceneEvent[]) {
        const storage = this.storage()
        if (!storage)
            return

        try {
            if (events.length === 0) {
                storage.removeItem(this.storageKey)
                return
            }
            const kept: SceneEvent[] = []
            let bytes = 0
            for (let i = events.length - 1; i >= 0; i--) {
                const size = JSON.stringify(events[i]).length
                if (bytes + size > MAX_STORED_BYTES)
                    break
                kept.push(events[i]!)
                bytes += size
            }
            kept.reverse()
            storage.setItem(this.storageKey, JSON.stringify(kept))
        }
        catch {}
    }

    private loadStored(): SceneEvent[] {
        const storage = this.storage()
        if (!storage)
            return []

        try {
            const raw = storage.getItem(this.storageKey)
            if (!raw)
                return []
            storage.removeItem(this.storageKey)
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed) ? parsed as SceneEvent[] : []
        }
        catch {
            return []
        }
    }

    private clearStored() {
        const storage = this.storage()
        try {
            storage?.removeItem(this.storageKey)
        }
        catch {}
    }

    private buildUrl(): string {
        return `${this.endpoint}?key=${encodeURIComponent(this.apiKey)}`
    }

    private buildBatch(events: SceneEvent[]): SceneBatch {
        return {
            session_id: this.sessionId,
            device_id: this.deviceId,
            ...(this.version ? { version: this.version } : {}),
            events,
            sent_at: new Date().toISOString(),
            page_url: location.href,
            user_agent: navigator.userAgent,
            screen: {
                width: screen.width,
                height: screen.height,
                viewport_width: window.innerWidth,
                viewport_height: window.innerHeight,
            },
        }
    }

    private async send(json: string, url: string): Promise<SendResult> {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: json,
                })
                if (response.ok)
                    return 'ok'

                if (response.status >= 400 && response.status < 500
                    && response.status !== 408 && response.status !== 429) {
                    return 'drop'
                }
            }
            catch {}

            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, (attempt + 1) * 200))
            }
        }
        return 'retry'
    }
}
