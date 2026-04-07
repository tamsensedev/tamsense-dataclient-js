import type { SceneBatch, SceneEvent } from '../types'

const MAX_RETRIES = 2
const BEACON_MAX_SIZE = 60000

export class Sender {
    private queue: SceneEvent[] = []
    private timer: ReturnType<typeof setInterval> | null = null
    private isFlushing = false

    constructor(
        private endpoint: string,
        private apiKey: string,
        private batchSize: number,
        private sessionId: string,
        private deviceId: string,
        flushInterval: number,
    ) {
        this.timer = setInterval(() => this.flush(), flushInterval)
    }

    add(event: SceneEvent) {
        this.queue.push(event)
        if (event.event === 'rrweb' || this.queue.length >= this.batchSize) {
            this.flush()
        }
    }

    async flush() {
        if (this.queue.length === 0 || this.isFlushing) {
            return
        }

        this.isFlushing = true

        const events = this.queue.splice(0)
        const batch = this.buildBatch(events)
        const json = JSON.stringify(batch)
        const url = this.buildUrl()

        const success = await this.send(json, url)

        if (!success) {
            this.queue.unshift(...events)
        }

        this.isFlushing = false
    }

    flushSync() {
        if (this.queue.length === 0) {
            return
        }

        const events = this.queue.splice(0)
        if (events.length === 0) return

        const url = this.buildUrl()

        let chunk: SceneEvent[] = []
        let chunkSize = 0

        for (const event of events) {
            const eventJson = JSON.stringify(event)
            if (chunkSize + eventJson.length > BEACON_MAX_SIZE && chunk.length > 0) {
                this.sendBeacon(chunk, url)
                chunk = []
                chunkSize = 0
            }
            chunk.push(event)
            chunkSize += eventJson.length
        }

        if (chunk.length > 0) {
            this.sendBeacon(chunk, url)
        }
    }

    destroy() {
        if (this.timer) {
            clearInterval(this.timer)
        }
        this.flushSync()
    }

    private sendBeacon(events: SceneEvent[], url: string) {
        const batch = this.buildBatch(events)
        const json = JSON.stringify(batch)
        const blob = new Blob([json], { type: 'application/json' })
        navigator.sendBeacon(url, blob)
    }

    private buildUrl(): string {
        return `${this.endpoint}?key=${encodeURIComponent(this.apiKey)}`
    }

    private buildBatch(events: SceneEvent[]): SceneBatch {
        return {
            session_id: this.sessionId,
            device_id: this.deviceId,
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

    private async send(json: string, url: string): Promise<boolean> {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: json,
                    keepalive: true,
                })
                if (response.ok) {
                    return true
                }
            }
            catch {}

            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, (attempt + 1) * 200))
            }
        }
        return false
    }
}
