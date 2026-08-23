import type { ActionEvent, Config, Tracker } from '../types'
import type { Sender } from '../utils/sender'
import { INTERACTIVE_ROLES, INTERACTIVE_TAGS, TEXT_INPUT_TYPES } from '../constants'
import { isInputMaskingEnabled, isMasked, maskText } from '../dom/mask'
import { getNodeId } from '../dom/serializer'
import { getViewport } from '../dom/viewport'
import { RrwebTracker } from './rrweb'

export class ActionTracker implements Tracker {
    private inputTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()
    private pendingInputs = new Set<HTMLElement>()

    private handleClick = (e: Event) => this.onClick(e)
    private handleInput = (e: Event) => this.onInput(e)
    private handleChange = (e: Event) => this.onChange(e)

    constructor(
        private config: Config,
        private sender: Sender,
        private root: HTMLElement,
    ) {}

    private get listenerTarget(): EventTarget {
        return this.config.scoped ? this.root : document
    }

    start() {
        const target = this.listenerTarget
        target.addEventListener('click', this.handleClick, true)
        target.addEventListener('input', this.handleInput, true)
        target.addEventListener('change', this.handleChange, true)
    }

    stop() {
        const target = this.listenerTarget
        target.removeEventListener('click', this.handleClick, true)
        target.removeEventListener('input', this.handleInput, true)
        target.removeEventListener('change', this.handleChange, true)
    }

    beforeUnload() {
        for (const el of this.pendingInputs) {
            const timer = this.inputTimers.get(el)
            if (timer) {
                clearTimeout(timer)
            }
            this.inputTimers.delete(el)
            this.recordInput(el)
        }
        this.pendingInputs.clear()
    }

    private onClick(e: Event) {
        const raw = e.target as HTMLElement
        if (!raw) {
            return
        }

        const tag = raw.tagName?.toLowerCase()
        if (tag === 'body' || tag === 'html') {
            return
        }

        const el = this.findMeaningfulElement(raw)
        const info = this.getElementInfo(el)

        const action: ActionEvent = {
            event: 'action',
            timestamp: new Date().toISOString(),
            type: 'click',
            targetId: info.targetId,
            tag: info.tag,
            role: info.role,
            text: info.text,
            url: location.href,
            state: info.state,
            viewport: getViewport(),
        }

        if (this.config.debug) {
            console.log(`[dataclient] click: ${info.tag}${info.role ? `[role=${info.role}]` : ''} "${info.text}"`)
        }

        this.sender.add(action)
        RrwebTracker.addMarker('click', { tag: info.tag, text: info.text, label: `Click: ${info.text || info.tag}` })
    }

    private onInput(e: Event) {
        const target = e.target as HTMLElement
        if (!target) {
            return
        }

        const tag = target.tagName?.toLowerCase()
        if (tag === 'input') {
            const type = (target as HTMLInputElement).type?.toLowerCase() || 'text'
            if (!TEXT_INPUT_TYPES.has(type)) {
                return
            }
        }
        else if (tag !== 'textarea') {
            return
        }

        this.pendingInputs.add(target)

        const prev = this.inputTimers.get(target)
        if (prev) {
            clearTimeout(prev)
        }

        this.inputTimers.set(target, setTimeout(() => {
            this.inputTimers.delete(target)
            this.pendingInputs.delete(target)
            this.recordInput(target)
        }, this.config.inputDebounce))
    }

    private recordInput(target: HTMLElement) {
        const rawValue = (target as HTMLInputElement).value || ''
        if (!rawValue) {
            return
        }

        const info = this.getElementInfo(target)
        const type = (target as HTMLInputElement).type?.toLowerCase() || ''
        const value = (isInputMaskingEnabled() || type === 'password' || info.masked)
            ? maskText(rawValue)
            : rawValue

        const action: ActionEvent = {
            event: 'action',
            timestamp: new Date().toISOString(),
            type: 'input',
            targetId: info.targetId,
            tag: info.tag,
            role: info.role,
            text: info.text,
            url: location.href,
            value,
            length: rawValue.length,
            viewport: getViewport(),
        }

        if (this.config.debug) {
            console.log(`[dataclient] input: ${info.tag} "${info.text}" → ${value.length} chars`)
        }

        this.sender.add(action)
        RrwebTracker.addMarker('input', { tag: info.tag, text: info.text, label: `Input: ${info.text || info.tag}` })
    }

    private onChange(e: Event) {
        const target = e.target as HTMLElement
        if (!target) {
            return
        }

        const info = this.getElementInfo(target)
        const tag = target.tagName?.toLowerCase()

        const action: ActionEvent = {
            event: 'action',
            timestamp: new Date().toISOString(),
            type: 'change',
            targetId: info.targetId,
            tag: info.tag,
            role: info.role,
            text: info.text,
            url: location.href,
            viewport: getViewport(),
        }

        if (tag === 'select') {
            const selectValue = (target as HTMLSelectElement).value
            action.value = (isInputMaskingEnabled() || info.masked)
                ? maskText(selectValue)
                : selectValue
        }
        else if (tag === 'input') {
            const type = (target as HTMLInputElement).type
            if (type === 'checkbox' || type === 'radio') {
                action.checked = (target as HTMLInputElement).checked
            }
        }

        if (this.config.debug) {
            console.log(`[dataclient] change: ${info.tag} "${info.text}"`)
        }

        this.sender.add(action)
        RrwebTracker.addMarker('change', { tag: info.tag, text: info.text, label: `Change: ${info.text || info.tag}` })
    }

    private getElementInfo(el: HTMLElement) {
        const tag = el.tagName?.toLowerCase() || ''
        let text = ''

        if (tag === 'input' || tag === 'textarea') {
            text = (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || ''
        }
        else {
            for (const child of el.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const t = child.textContent?.trim()
                    if (t) {
                        text += (text ? ' ' : '') + t
                    }
                }
            }
            if (!text) {
                text = el.textContent?.trim().slice(0, 100) || ''
            }
        }

        const masked = isMasked(el)
        const finalText = masked ? maskText(text) : text

        return {
            tag,
            role: el.getAttribute?.('role')?.trim().slice(0, 50) || '',
            text: finalText.slice(0, 100),
            targetId: getNodeId(el),
            state: (el as HTMLButtonElement).disabled ? 'disabled' : 'enabled',
            masked,
        }
    }

    private findMeaningfulElement(el: HTMLElement): HTMLElement {
        let current: HTMLElement | null = el
        while (current && current !== this.root && current !== document.body) {
            if (INTERACTIVE_TAGS.has(current.tagName?.toLowerCase())) {
                return current
            }
            const role = current.getAttribute('role')
            if (role && INTERACTIVE_ROLES.has(role)) {
                return current
            }
            current = current.parentElement
        }
        return el
    }
}
