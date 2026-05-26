import type { Config, Tracker } from './types'
import { ActionTracker } from './trackers/action'
import { MutationTracker } from './trackers/mutation'
import { RrwebTracker } from './trackers/rrweb'
import { SnapshotTracker } from './trackers/snapshot'
import { generateId, getDeviceId } from './utils/identity'
import { Sender } from './utils/sender'

export type * from './types'

const defaults: Config = {
    endpoint: 'https://my.tamsense.com/api/events',
    debug: false,
    batchSize: 5,
    flushInterval: 5000,
    checkpointInterval: 30000,
    idleTimeout: 60 * 60 * 1000,
    mutationDebounce: 200,
    inputDebounce: 1000,
    sessionIdKey: 'sc2_sid',
    deviceIdKey: 'sc2_did',
    apiKey: '',
    scoped: '',
}

const VALID_ATTR_NAME = /^[a-z][\w-]*$/i

export class DataClient {
    private sender: Sender | null = null
    private trackers: Tracker[] = []
    private config: Config
    private deviceId: string
    private idleTimer: ReturnType<typeof setTimeout> | null = null
    private userId: string | null = null
    private rootEl: HTMLElement | null = null
    private scopeObserver: MutationObserver | null = null
    private scopeCheckScheduled = false
    private activityHandler: (() => void) | null = null
    private activityTarget: EventTarget | null = null

    constructor(options?: Partial<Config>) {
        this.config = { ...defaults, ...options }
        this.config.scoped = this.normalizeScoped(this.config.scoped)
        this.deviceId = getDeviceId(this.config.deviceIdKey)

        if (this.config.scoped) {
            this.startScopedMode()
        }
        else {
            this.startSession(document.body)
            this.attachActivityListeners(document)
        }
    }

    setUser(userId: string) {
        this.userId = userId
        this.sender?.add({ event: 'identify', timestamp: new Date().toISOString(), user_id: userId })
    }

    excludeSession(reason = '') {
        this.sender?.add({ event: 'exclude', timestamp: new Date().toISOString(), reason })
        this.stopSession()
        if (this.scopeObserver) {
            this.scopeObserver.disconnect()
            this.scopeObserver = null
        }
        this.detachActivityListeners()
    }

    private normalizeScoped(value: string): string {
        if (!value) {
            return ''
        }
        if (!VALID_ATTR_NAME.test(value)) {
            if (this.config.debug) {
                console.warn(`[dataclient] invalid "scoped" attribute name: ${JSON.stringify(value)}. Falling back to non-scoped mode.`)
            }
            return ''
        }
        return value
    }

    private startScopedMode() {
        const initial = this.findRoot()
        if (initial) {
            this.onRootAppeared(initial)
        }
        this.scopeObserver = new MutationObserver(() => this.scheduleScopeCheck())
        this.scopeObserver.observe(document.body, { childList: true, subtree: true })

        if (this.config.debug) {
            console.log(`[dataclient] scoped mode: watching for [${this.config.scoped}]`)
        }
    }

    private findRoot(): HTMLElement | null {
        return document.querySelector<HTMLElement>(`[${this.config.scoped}]`)
    }

    private scheduleScopeCheck() {
        if (this.scopeCheckScheduled) {
            return
        }
        this.scopeCheckScheduled = true
        queueMicrotask(() => {
            this.scopeCheckScheduled = false
            this.handleScopeChange()
        })
    }

    private handleScopeChange() {
        const current = this.findRoot()
        if (current === this.rootEl) {
            return
        }
        if (this.rootEl) {
            this.onRootDisappeared()
        }
        if (current) {
            this.onRootAppeared(current)
        }
    }

    private onRootAppeared(root: HTMLElement) {
        this.rootEl = root
        this.attachActivityListeners(root)
        this.startSession(root)
        if (this.config.debug) {
            console.log(`[dataclient] root [${this.config.scoped}] appeared`)
        }
    }

    private onRootDisappeared() {
        if (this.config.debug) {
            console.log(`[dataclient] root [${this.config.scoped}] removed`)
        }
        this.detachActivityListeners()
        this.stopSession()
        this.rootEl = null
    }

    private onActivity() {
        if (!this.sender) {
            if (this.config.scoped) {
                if (!this.rootEl) {
                    return
                }
                this.startSession(this.rootEl)
            }
            else {
                this.startSession(document.body)
            }
        }
        this.resetIdleTimer()
    }

    private resetIdleTimer() {
        if (this.idleTimer)
            clearTimeout(this.idleTimer)
        this.idleTimer = setTimeout(() => this.stopSession(), this.config.idleTimeout)
    }

    private attachActivityListeners(target: EventTarget) {
        this.detachActivityListeners()
        const handler = () => this.onActivity()
        target.addEventListener('click', handler, true)
        target.addEventListener('input', handler, true)
        target.addEventListener('change', handler, true)
        this.activityHandler = handler
        this.activityTarget = target
    }

    private detachActivityListeners() {
        if (!this.activityHandler || !this.activityTarget) {
            return
        }
        this.activityTarget.removeEventListener('click', this.activityHandler, true)
        this.activityTarget.removeEventListener('input', this.activityHandler, true)
        this.activityTarget.removeEventListener('change', this.activityHandler, true)
        this.activityHandler = null
        this.activityTarget = null
    }

    private startSession(root: HTMLElement) {
        const sessionId = generateId()

        this.sender = new Sender(
            this.config.endpoint,
            this.config.apiKey,
            this.config.batchSize,
            sessionId,
            this.deviceId,
            this.config.flushInterval,
        )

        const snapshotTracker = new SnapshotTracker(this.config, this.sender, root)
        const mutationTracker = new MutationTracker(this.config, this.sender, root, () => snapshotTracker.markMutation())
        const actionTracker = new ActionTracker(this.config, this.sender, root)
        const rrwebTracker = new RrwebTracker(this.config, this.sender)

        this.trackers = [snapshotTracker, mutationTracker, actionTracker, rrwebTracker]
        this.trackers.forEach(t => t.start())

        if (this.userId) {
            this.sender.add({ event: 'identify', timestamp: new Date().toISOString(), user_id: this.userId })
        }

        this.resetIdleTimer()

        const onLeave = () => {
            this.trackers.forEach(t => t.beforeUnload?.())
            this.sender?.flushSync()
        }

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden')
                onLeave()
        })
        window.addEventListener('pagehide', onLeave)

        if (this.config.debug) {
            console.log(`[dataclient] Session started: ${sessionId}`)
        }
    }

    private stopSession() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer)
            this.idleTimer = null
        }
        this.trackers.forEach(t => t.beforeUnload?.())
        this.trackers.forEach(t => t.stop())
        this.trackers = []
        if (this.sender) {
            this.sender.destroy()
            this.sender = null
        }

        if (this.config.debug) {
            console.log('[dataclient] Session stopped')
        }
    }
}
