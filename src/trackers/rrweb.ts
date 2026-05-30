import type { Config, RrwebEvent, Tracker } from '../types'
import type { Sender } from '../utils/sender'
import { record } from 'rrweb'
import { MASK_SELECTOR } from '../constants'
import { maskText } from '../dom/mask'

export class RrwebTracker implements Tracker {
    private stopFn: (() => void) | null = null

    constructor(
        private config: Config,
        private sender: Sender,
        private root: HTMLElement,
    ) {}

    start() {
        const scoped = this.config.scoped
        const rootIsScoped = !!scoped && this.root !== document.body && this.root.hasAttribute(scoped)
        const blockSelector = rootIsScoped
            ? `:not([${scoped}]):not([${scoped}] *):not(:has([${scoped}])):not(head):not(head *)`
            : undefined

        this.stopFn = record({
            emit: (event) => {
                const rrwebEvent: RrwebEvent = {
                    event: 'rrweb',
                    timestamp: new Date().toISOString(),
                    rrwebEvent: event,
                }
                this.sender.add(rrwebEvent)
            },
            recordCrossOriginIframes: false,
            recordCanvas: false,
            maskTextSelector: MASK_SELECTOR,
            maskTextFn: text => '*'.repeat(text.length),
            maskAllInputs: true,
            maskInputFn: (text, el) => {
                if (el?.closest(MASK_SELECTOR))
                    return maskText(text)
                if (el instanceof HTMLInputElement && el.type === 'password')
                    return '*'.repeat(text.length)
                return text
            },
            blockSelector,
            sampling: {
                mousemove: false,
                mouseInteraction: true,
                scroll: 500,
                input: 'last',
            },
        }) ?? null

        if (this.config.debug)
            console.log('[dataclient] rrweb recording started')
    }

    stop() {
        if (this.stopFn) {
            this.stopFn()
            this.stopFn = null
        }
    }

    static addMarker(tag: string, payload: unknown) {
        record.addCustomEvent(tag, payload)
    }
}
