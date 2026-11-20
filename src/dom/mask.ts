import { MASK_SELECTOR } from '../constants'

let maskAllInputs = true
let maskEverything = false
let maskSelectorText = MASK_SELECTOR
let blockSelectorText: string | null = null

export interface PrivacyOptions {
    maskEverything: boolean
    hide: string[]
    skip: string[]
}

export function setInputMasking(enabled: boolean) {
    maskAllInputs = enabled
}

export function isInputMaskingEnabled(): boolean {
    return maskAllInputs
}

export function setPrivacy(options: PrivacyOptions) {
    maskEverything = options.maskEverything
    maskSelectorText = [MASK_SELECTOR, ...options.hide, ...options.skip].join(', ')
    blockSelectorText = options.skip.length > 0 ? options.skip.join(', ') : null
}

export function isMaskingEverything(): boolean {
    return maskEverything
}

export function maskSelector(): string {
    return maskSelectorText
}

export function blockSelector(): string | null {
    return blockSelectorText
}

export function usableSelectors(selectors: string[]): string[] {
    const probe = document.createDocumentFragment()
    return selectors.filter((selector) => {
        try {
            probe.querySelector(selector)
            return true
        }
        catch {
            return false
        }
    })
}

const INPUT_TAGS = new Set(['input', 'textarea', 'select'])

function elementOf(el: Element | Node | null): Element | null {
    if (!el) {
        return null
    }
    return el.nodeType === Node.ELEMENT_NODE ? el as Element : el.parentElement
}

export function isUserInputElement(el: Element | Node | null): boolean {
    const element = elementOf(el)
    if (!element) {
        return false
    }
    if (INPUT_TAGS.has(element.tagName?.toLowerCase())) {
        return true
    }
    return (element as HTMLElement).isContentEditable === true
}

export function isMasked(el: Element | Node | null): boolean {
    const element = elementOf(el)
    if (!element) {
        return false
    }
    return maskEverything || !!element.closest(maskSelectorText)
}

export function isBlocked(el: Element): boolean {
    return blockSelectorText !== null && !!el.closest(blockSelectorText)
}

export function maskText(text: string): string {
    if (!text) {
        return text
    }
    return '*'.repeat(text.length)
}

export function maskValue(el: Element | null, value: string): string {
    return isMasked(el) ? maskText(value) : value
}
