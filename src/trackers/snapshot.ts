import type { Config, SnapshotEvent, Tracker } from '../types'
import type { Sender } from '../utils/sender'
import { resetIds, serializeTree } from '../dom/serializer'
import { getViewport } from '../dom/viewport'

export class SnapshotTracker implements Tracker {
    private lastUrl = ''
    private urlPollTimer: ReturnType<typeof setInterval> | null = null
    private checkpointTimer: ReturnType<typeof setInterval> | null = null
    private hasMutations = false

    constructor(
        private config: Config,
        private sender: Sender,
        private root: HTMLElement,
    ) {}

    start() {
        this.lastUrl = location.href
        this.recordSnapshot()

        this.urlPollTimer = setInterval(() => this.pollUrl(), 500)
        this.checkpointTimer = setInterval(() => this.checkpoint(), this.config.checkpointInterval)
    }

    stop() {
        if (this.urlPollTimer) {
            clearInterval(this.urlPollTimer)
        }
        if (this.checkpointTimer) {
            clearInterval(this.checkpointTimer)
        }
    }

    beforeUnload() {
        if (this.hasMutations) {
            this.recordSnapshot()
        }
    }

    markMutation() {
        this.hasMutations = true
    }

    private recordSnapshot() {
        resetIds()

        const snapshot: SnapshotEvent = {
            event: 'snapshot',
            timestamp: new Date().toISOString(),
            url: location.href,
            title: document.title,
            tree: serializeTree(this.root),
            viewport: getViewport(),
        }

        if (this.config.debug) {
            console.log(`[dataclient] snapshot: ${location.href} (${snapshot.tree.length} nodes)`)
        }

        this.sender.add(snapshot)
        this.sender.flush()
        this.hasMutations = false
    }

    private pollUrl() {
        if (location.href !== this.lastUrl) {
            const prev = this.lastUrl
            this.lastUrl = location.href
            if (prev) {
                if (this.config.debug) {
                    console.log(`[dataclient] URL changed: ${prev} → ${location.href}`)
                }
                this.recordSnapshot()
            }
        }
    }

    private checkpoint() {
        if (this.hasMutations) {
            if (this.config.debug) {
                console.log('[dataclient] checkpoint snapshot')
            }
            this.recordSnapshot()
        }
    }
}
