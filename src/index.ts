import type { Config, Tracker } from './types'
import { ActionTracker } from './trackers/action'
import { MutationTracker } from './trackers/mutation'
import { RrwebTracker } from './trackers/rrweb'
import { SnapshotTracker } from './trackers/snapshot'
import { generateId, getDeviceId } from './utils/identity'
import { Sender } from './utils/sender'

export type * from './types'

const defaults: Config = {
    endpoint: 'https://my.tamsense.com/api/scenes2',
    debug: false,
    batchSize: 5,
    flushInterval: 5000,
    checkpointInterval: 30000,
    mutationDebounce: 200,
    inputDebounce: 1000,
    sessionIdKey: 'sc2_sid',
    deviceIdKey: 'sc2_did',
    apiKey: '',
}

export class DataClient {
    private sender: Sender
    private trackers: Tracker[] = []
    private config: Config

    constructor(options?: Partial<Config>) {
        this.config = { ...defaults, ...options }

        const sessionId = generateId()
        const deviceId = getDeviceId(this.config.deviceIdKey)

        this.sender = new Sender(
            this.config.endpoint,
            this.config.apiKey,
            this.config.batchSize,
            sessionId,
            deviceId,
            this.config.flushInterval,
        )

        const snapshotTracker = new SnapshotTracker(this.config, this.sender)
        const mutationTracker = new MutationTracker(this.config, this.sender, () => snapshotTracker.markMutation())
        const actionTracker = new ActionTracker(this.config, this.sender)
        const rrwebTracker = new RrwebTracker(this.config, this.sender)

        this.trackers = [snapshotTracker, mutationTracker, actionTracker, rrwebTracker]
        this.trackers.forEach(t => t.start())

        const onLeave = () => {
            this.trackers.forEach(t => t.beforeUnload?.())
            this.sender.flushSync()
        }

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') onLeave()
        })
        window.addEventListener('pagehide', onLeave)
    }

    setUser(userId: string) {
        this.sender.add({ event: 'identify', timestamp: new Date().toISOString(), user_id: userId })
    }

    excludeSession(reason = '') {
        this.sender.add({ event: 'exclude', timestamp: new Date().toISOString(), reason })
        this.destroy()
    }

    destroy() {
        this.trackers.forEach(t => t.stop())
        this.trackers = []
        this.sender.destroy()
    }
}
