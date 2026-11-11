import type { Config, Tracker } from './types'
import type { Marks } from './utils/marks'
import { setInputMasking } from './dom/mask'
import { ActionTracker } from './trackers/action'
import { MutationTracker } from './trackers/mutation'
import { RrwebTracker } from './trackers/rrweb'
import { SnapshotTracker } from './trackers/snapshot'
import { clearSession, getDeviceId, getSessionId, touchSession } from './utils/identity'
import { externalReferrer, fromSessionOfUrl, hasMarks, isProjectLink, marksOfUrl, readSessionMarks, sameMarks, withMarks, writeSessionMarks } from './utils/marks'
import { Sender } from './utils/sender'

export type * from './types'
export type { MarkParam, Marks } from './utils/marks'

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
    maskAllInputs: true,
    rrwebCheckpointInterval: 10 * 60 * 1000,
    requestTimeout: 10_000,
    maxAttempts: 6,
    maxQueueBytes: 2 * 1024 * 1024,
    beacon: true,
    beaconMaxBytes: 16_000,
    decorateLinks: true,
    linkDomains: [],
}

const VALID_ATTR_NAME = /^[a-z][\w-]*$/i

export class DataClient {
    private sender: Sender | null = null
    private trackers: Tracker[] = []
    private config: Config
    private deviceId: string
    private sessionId: string | null = null
    private idleTimer: ReturnType<typeof setTimeout> | null = null
    private userId: string | null = null
    private rootEl: HTMLElement | null = null
    private scopeObserver: MutationObserver | null = null
    private scopeCheckScheduled = false
    private activityHandler: (() => void) | null = null
    private activityTarget: EventTarget | null = null
    private marks: Marks = {}
    private fromSession = ''

    constructor(options?: Partial<Config>) {
        this.config = { ...defaults, ...options }
        this.config.scoped = this.normalizeScoped(this.config.scoped)
        setInputMasking(this.config.maskAllInputs !== false)
        this.deviceId = getDeviceId(this.config.deviceIdKey)

        if (this.config.scoped) {
            this.startScopedMode()
        }
        else {
            this.startSession(document.body)
            this.attachActivityListeners(document)
        }

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'hidden')
                return
            this.trackers.forEach(t => t.beforeUnload?.())
            this.sender?.flush()
            this.sender?.persist()
        })
        window.addEventListener('pagehide', () => {
            this.trackers.forEach(t => t.beforeUnload?.())
            this.sender?.flushOnUnload()
        })
        for (const type of ['click', 'auxclick', 'contextmenu']) {
            document.addEventListener(type, event => this.decorateLink(event), true)
        }
    }

    // Метки, с которыми пришла текущая сессия: например, чтобы сохранить их при регистрации
    getMarks(): Marks {
        return { ...this.marks }
    }

    setUser(userId: string) {
        this.userId = userId
        this.sender?.add({ event: 'identify', timestamp: new Date().toISOString(), user_id: userId })
    }

    excludeSession(reason = '') {
        this.sender?.add({ event: 'exclude', timestamp: new Date().toISOString(), reason })
        clearSession(this.config.sessionIdKey)
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
        const initial = this.resolveScope()
        this.activateScope(initial)

        this.scopeObserver = new MutationObserver(() => this.scheduleScopeCheck())
        this.scopeObserver.observe(document.body, { childList: true, subtree: true })

        if (this.config.debug) {
            console.log(`[dataclient] scoped mode: looking for [${this.config.scoped}], fallback to body`)
        }
    }

    private findRoot(): HTMLElement | null {
        return document.querySelector<HTMLElement>(`[${this.config.scoped}]`)
    }

    private resolveScope(): HTMLElement {
        return this.findRoot() ?? document.body
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
        const current = this.resolveScope()
        if (current === this.rootEl) {
            return
        }
        this.detachActivityListeners()
        this.stopSession()
        this.activateScope(current)
    }

    private activateScope(root: HTMLElement) {
        this.rootEl = root
        this.attachActivityListeners(root)
        this.startSession(root)
        if (this.config.debug) {
            const kind = root === document.body ? 'document.body (fallback)' : `[${this.config.scoped}]`
            console.log(`[dataclient] scope: ${kind}`)
        }
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
        if (this.sessionId) {
            touchSession(this.config.sessionIdKey, this.sessionId)
        }
        this.resetIdleTimer()
    }

    private resetIdleTimer() {
        if (this.idleTimer)
            clearTimeout(this.idleTimer)
        this.idleTimer = setTimeout(() => {
            clearSession(this.config.sessionIdKey)
            this.stopSession()
        }, this.config.idleTimeout)
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
        const sessionId = getSessionId(this.config.sessionIdKey, this.config.idleTimeout)
        this.sessionId = sessionId

        this.sender = new Sender(this.config, sessionId, this.deviceId)

        const snapshotTracker = new SnapshotTracker(this.config, this.sender, root)
        const mutationTracker = new MutationTracker(this.config, this.sender, root, () => snapshotTracker.markMutation())
        const actionTracker = new ActionTracker(this.config, this.sender, root)
        const rrwebTracker = new RrwebTracker(this.config, this.sender, root)

        this.trackers = [snapshotTracker, mutationTracker, actionTracker, rrwebTracker]
        this.trackers.forEach(t => t.start())

        if (this.userId) {
            this.sender.add({ event: 'identify', timestamp: new Date().toISOString(), user_id: this.userId })
        }
        this.recordMarks(sessionId)

        this.resetIdleTimer()

        if (this.config.debug) {
            console.log(`[dataclient] Session started: ${sessionId}`)
        }
    }

    // Новые метки и новая сессия, откуда пришли по ссылке, уходят событием сразу; сайт, откуда пришли, записывается один раз на сессию
    private recordMarks(sessionId: string) {
        const marksInUrl = marksOfUrl(location.href)
        const fromSessionInUrl = fromSessionOfUrl(location.href, sessionId)
        const saved = readSessionMarks(this.config.sessionIdKey)
        const known = saved?.sessionId === sessionId ? saved : null
        const hasNewMarks = hasMarks(marksInUrl) && !(known !== null && sameMarks(known.marks, marksInUrl))
        const hasNewSource = fromSessionInUrl !== '' && fromSessionInUrl !== known?.fromSession
        const referrer = known === null ? externalReferrer(document.referrer, location.hostname) : ''
        this.marks = hasNewMarks ? marksInUrl : known?.marks ?? {}
        this.fromSession = fromSessionInUrl || known?.fromSession || ''
        writeSessionMarks(this.config.sessionIdKey, { sessionId, marks: this.marks, fromSession: this.fromSession })
        if (hasNewMarks || hasNewSource || referrer) {
            this.sender?.add({
                event: 'marks',
                timestamp: new Date().toISOString(),
                marks: this.marks,
                referrer,
                landing_url: `${location.origin}${location.pathname}`,
                from_session: this.fromSession,
            })
        }
    }

    // Переход на другой сайт проекта уносит метки и номер сессии: там их прочитает тот же трекер и свяжет две сессии
    private decorateLink(event: Event) {
        if (!this.config.decorateLinks || !(event.target instanceof Element)) {
            return
        }
        if (!this.sessionId && !hasMarks(this.marks)) {
            return
        }
        const anchor = event.target.closest('a[href]')
        if (anchor instanceof HTMLAnchorElement && isProjectLink(anchor.hostname, location.hostname, this.config.linkDomains)) {
            anchor.href = withMarks(anchor.href, this.marks, this.sessionId)
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
        this.sessionId = null
        if (this.sender) {
            this.sender.destroy()
            this.sender = null
        }

        if (this.config.debug) {
            console.log('[dataclient] Session stopped')
        }
    }
}
