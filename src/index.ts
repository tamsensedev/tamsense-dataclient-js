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
}

export class DataClient {
    private sender: Sender | null = null
    private trackers: Tracker[] = []
    private config: Config
    private deviceId: string
    private idleTimer: ReturnType<typeof setTimeout> | null = null
    private userId: string | null = null

    constructor(options?: Partial<Config>) {
        this.config = { ...defaults, ...options }
        this.deviceId = getDeviceId(this.config.deviceIdKey)

        this.startSession()

        document.addEventListener('click', () => this.onActivity(), true)
        document.addEventListener('input', () => this.onActivity(), true)
        document.addEventListener('change', () => this.onActivity(), true)
    }

    setUser(userId: string) {
        this.userId = userId
        this.sender?.add({ event: 'identify', timestamp: new Date().toISOString(), user_id: userId })
    }

    excludeSession(reason = '') {
        this.sender?.add({ event: 'exclude', timestamp: new Date().toISOString(), reason })
        this.stopSession()
    }

    private onActivity() {
        if (!this.sender) {
            this.startSession()
        }
        this.resetIdleTimer()
    }

    private resetIdleTimer() {
        if (this.idleTimer)
            clearTimeout(this.idleTimer)
        this.idleTimer = setTimeout(() => this.stopSession(), this.config.idleTimeout)
    }

    private startSession() {
        const sessionId = generateId()

        this.sender = new Sender(
            this.config.endpoint,
            this.config.apiKey,
            this.config.batchSize,
            sessionId,
            this.deviceId,
            this.config.flushInterval,
        )

        const snapshotTracker = new SnapshotTracker(this.config, this.sender)
        const mutationTracker = new MutationTracker(this.config, this.sender, () => snapshotTracker.markMutation())
        const actionTracker = new ActionTracker(this.config, this.sender)
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
        this.trackers.forEach(t => t.stop())
        this.trackers = []
        if (this.sender) {
            this.sender.destroy()
            this.sender = null
        }

        if (this.config.debug) {
            console.log('[dataclient] Session stopped (idle timeout)')
        }
    }
}
