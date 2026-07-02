import type { AttrChange, Config, MutationAdd, MutationEvent, TextChange, Tracker } from '../types'
import type { Sender } from '../utils/sender'
import { WATCH_ATTRS } from '../constants'
import { isInputMaskingEnabled, isMasked, isUserInputElement, maskText } from '../dom/mask'
import { getNodeId, removeNodeId, serializeSubtree } from '../dom/serializer'

export class MutationTracker implements Tracker {
    private observer: MutationObserver | null = null
    private debounceTimer: ReturnType<typeof setTimeout> | null = null

    private pendingAdds: MutationAdd[] = []
    private pendingRemoves: number[] = []
    private pendingTextChanges: TextChange[] = []
    private pendingAttrChanges: AttrChange[] = []

    constructor(
        private config: Config,
        private sender: Sender,
        private root: HTMLElement,
        private onMutation: () => void,
    ) {}

    start() {
        this.observer = new MutationObserver(mutations => this.handleMutations(mutations))
        this.observer.observe(this.root, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: WATCH_ATTRS,
        })
    }

    stop() {
        this.observer?.disconnect()
        this.observer = null
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }
    }

    beforeUnload() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.flush()
        }
    }

    private flush() {
        this.debounceTimer = null

        if (
            this.pendingAdds.length === 0
            && this.pendingRemoves.length === 0
            && this.pendingTextChanges.length === 0
            && this.pendingAttrChanges.length === 0
        ) {
            return
        }

        const mutation: MutationEvent = {
            event: 'mutation',
            timestamp: new Date().toISOString(),
            url: window.location.href,
            adds: this.pendingAdds,
            removes: this.pendingRemoves,
            text_changes: this.pendingTextChanges,
            attr_changes: this.pendingAttrChanges,
        }

        if (this.config.debug) {
            console.log(`[dataclient] mutation: +${this.pendingAdds.length} -${this.pendingRemoves.length} text:${this.pendingTextChanges.length} attr:${this.pendingAttrChanges.length}`)
        }

        this.sender.add(mutation)
        this.onMutation()

        this.pendingAdds = []
        this.pendingRemoves = []
        this.pendingTextChanges = []
        this.pendingAttrChanges = []
    }

    private scheduleFlush() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }
        this.debounceTimer = setTimeout(() => this.flush(), this.config.mutationDebounce)
    }

    private handleMutations(mutations: MutationRecord[]) {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    continue
                }
                const el = node as HTMLElement
                const nodes = serializeSubtree(el)
                if (nodes.length === 0) {
                    continue
                }

                const parentId = getNodeId(el.parentElement!)
                if (parentId === null) {
                    continue
                }

                this.pendingAdds.push({ parentId, nodes })
            }

            for (const node of m.removedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) {
                    continue
                }
                const id = getNodeId(node)
                if (id !== null) {
                    this.pendingRemoves.push(id)
                    removeNodeId(id)
                }
            }

            if (m.type === 'characterData' && m.target.parentElement) {
                const parent = m.target.parentElement
                const parentId = getNodeId(parent)
                if (parentId !== null) {
                    let text = m.target.textContent?.trim().slice(0, 200) || ''
                    if ((isInputMaskingEnabled() && isUserInputElement(parent)) || isMasked(parent)) {
                        text = maskText(text)
                    }
                    this.pendingTextChanges.push({ id: parentId, text })
                }
            }

            if (m.type === 'attributes' && m.attributeName) {
                const id = getNodeId(m.target)
                if (id !== null) {
                    const el = m.target as HTMLElement
                    const attr = m.attributeName
                    let value = el.getAttribute(attr)?.slice(0, 200) ?? null
                    if (value !== null) {
                        const maskAsInput = attr === 'value' && isInputMaskingEnabled() && isUserInputElement(el)
                        if (maskAsInput || ((attr === 'value' || attr === 'placeholder') && isMasked(el))) {
                            value = maskText(value)
                        }
                    }
                    this.pendingAttrChanges.push({ id, attr, value })
                }
            }
        }

        if (
            this.pendingAdds.length > 0
            || this.pendingRemoves.length > 0
            || this.pendingTextChanges.length > 0
            || this.pendingAttrChanges.length > 0
        ) {
            this.scheduleFlush()
        }
    }
}
