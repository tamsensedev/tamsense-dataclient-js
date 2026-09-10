import type { Config, SceneBatch, SceneEvent } from '../types'

const MAX_REQUEST_BYTES = 256 * 1024

const MAX_STORED_BYTES = 1024 * 1024

const MAX_BACKOFF_MS = 30_000
const STORAGE_PREFIX = 'sc2_pending_'

interface Entry {
    event: SceneEvent
    json: string
    attempts: number
}

type SendResult = 'ok' | 'retry' | 'drop'

export class Sender {
    private queue: Entry[] = []
    private queueBytes = 0
    private inflight: Entry[] = []
    private timer: ReturnType<typeof setInterval> | null = null
    private retryTimer: ReturnType<typeof setTimeout> | null = null
    private flushPromise: Promise<void> = Promise.resolve()
    private backoffMs = 0
    private nextAttemptAt = 0
    private destroyed = false
    private storageKey: string

    constructor(
        private config: Config,
        private sessionId: string,
        private deviceId: string,
    ) {
        this.storageKey = `${STORAGE_PREFIX}${sessionId}`
        this.pruneStorage()

        for (const event of this.loadStored()) {
            this.enqueue(event)
        }

        this.timer = setInterval(() => this.flush(), config.flushInterval)

        if (this.queue.length > 0) {
            this.flush()
        }
    }

    add(event: SceneEvent) {
        if (this.destroyed)
            return

        this.enqueue(event)

        const isRrwebSnapshot = event.event === 'rrweb'
            && event.rrwebEvent.type === 2

        if (isRrwebSnapshot || this.queue.length >= this.config.batchSize) {
            this.flush()
        }
    }

    flush() {
        this.flushPromise = this.flushPromise.then(() => this.doFlush())
    }

    persist() {
        this.store()
    }

    flushOnUnload() {
        if (this.config.beacon && this.isHealthy() && this.queue.length > 0) {
            const envelope = JSON.stringify(this.buildBatch([])).length
            const limit = this.config.beaconMaxBytes - envelope
            const events: SceneEvent[] = []
            let bytes = 0
            let payload = 0

            for (const entry of this.queue) {
                if (payload + entry.json.length + 1 > limit)
                    break
                events.push(entry.event)
                bytes += entry.json.length
                payload += entry.json.length + 1
            }

            if (events.length > 0 && this.sendBeacon(events)) {
                this.queue.splice(0, events.length)
                this.queueBytes -= bytes
            }
        }

        this.store()
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
        this.destroyed = true
        this.flush()
    }

    private isHealthy(): boolean {
        return Date.now() >= this.nextAttemptAt
    }

    private enqueue(event: SceneEvent) {
        const json = JSON.stringify(event)
        this.queue.push({ event, json, attempts: 0 })
        this.queueBytes += json.length

        while (this.queueBytes > this.config.maxQueueBytes && this.queue.length > 0) {
            this.queueBytes -= this.queue.shift()!.json.length
        }
    }

    private requeue(entries: Entry[]) {
        this.queue = entries.concat(this.queue)
        for (const entry of entries) {
            this.queueBytes += entry.json.length
        }
    }

    private async doFlush() {
        if (this.queue.length === 0)
            return

        if (!this.isHealthy()) {
            if (this.destroyed)
                this.store()
            return
        }

        const entries = this.queue.splice(0)
        this.queueBytes = 0
        const url = this.buildUrl()

        for (let i = 0; i < entries.length;) {
            const start = i
            let bytes = 0

            while (i < entries.length && (i === start || bytes + entries[i]!.json.length <= MAX_REQUEST_BYTES)) {
                bytes += entries[i]!.json.length
                i++
            }

            const request = entries.slice(start, i)
            this.inflight = entries.slice(start)

            const result = await this.send(JSON.stringify(this.buildBatch(request.map(e => e.event))), url)
            this.inflight = []

            if (result === 'retry') {
                for (const entry of request) {
                    entry.attempts++
                }
                const kept = request.filter(e => e.attempts < this.config.maxAttempts)
                this.requeue(kept.concat(entries.slice(i)))

                if (this.destroyed)
                    this.store()
                else
                    this.scheduleRetry()
                return
            }
        }

        this.backoffMs = 0
        this.nextAttemptAt = 0
        this.store()
    }

    private scheduleRetry() {
        this.backoffMs = this.backoffMs === 0
            ? 1000
            : Math.min(this.backoffMs * 2, MAX_BACKOFF_MS)
        this.nextAttemptAt = Date.now() + this.backoffMs

        this.store()

        if (this.retryTimer) {
            clearTimeout(this.retryTimer)
        }
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null
            this.nextAttemptAt = 0
            this.flush()
        }, this.backoffMs)
    }

    private sendBeacon(events: SceneEvent[]): boolean {
        if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function')
            return false

        try {
            const json = JSON.stringify(this.buildBatch(events))
            const blob = new Blob([json], { type: 'application/json' })
            return navigator.sendBeacon(this.buildUrl(), blob)
        }
        catch {
            return false
        }
    }

    private storage(): Storage | null {
        try {
            return typeof sessionStorage === 'undefined' ? null : sessionStorage
        }
        catch {
            return null
        }
    }

    private pruneStorage() {
        const storage = this.storage()
        if (!storage)
            return

        try {
            const stale: string[] = []
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i)
                if (key && key.startsWith(STORAGE_PREFIX) && key !== this.storageKey)
                    stale.push(key)
            }
            for (const key of stale) {
                storage.removeItem(key)
            }
        }
        catch {}
    }

    private store() {
        const storage = this.storage()
        if (!storage)
            return

        try {
            const entries = this.inflight.concat(this.queue)
            if (entries.length === 0) {
                storage.removeItem(this.storageKey)
                return
            }
            const kept: string[] = []
            let bytes = 0
            for (let i = entries.length - 1; i >= 0; i--) {
                const size = entries[i]!.json.length
                if (bytes + size > MAX_STORED_BYTES)
                    break
                kept.push(entries[i]!.json)
                bytes += size
            }
            kept.reverse()
            storage.setItem(this.storageKey, `[${kept.join(',')}]`)
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

    private buildUrl(): string {
        return `${this.config.endpoint}?key=${encodeURIComponent(this.config.apiKey)}`
    }

    private buildBatch(events: SceneEvent[]): SceneBatch {
        return {
            session_id: this.sessionId,
            device_id: this.deviceId,
            ...(this.config.version ? { version: this.config.version } : {}),
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
        const controller = typeof AbortController === 'undefined' ? null : new AbortController()
        const timeout = controller
            ? setTimeout(() => controller.abort(), this.config.requestTimeout)
            : null

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: json,
                signal: controller?.signal,
            })
            if (response.ok)
                return 'ok'

            if (response.status >= 400 && response.status < 500
                && response.status !== 408 && response.status !== 429) {
                return 'drop'
            }
            return 'retry'
        }
        catch {
            return 'retry'
        }
        finally {
            if (timeout)
                clearTimeout(timeout)
        }
    }
}
