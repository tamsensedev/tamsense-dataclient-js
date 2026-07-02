import { MASK_SELECTOR } from '../constants'

let maskAllInputs = true

export function setInputMasking(enabled: boolean) {
    maskAllInputs = enabled
}

export function isInputMaskingEnabled(): boolean {
    return maskAllInputs
}

const INPUT_TAGS = new Set(['input', 'textarea', 'select'])

export function isUserInputElement(el: Element | Node | null): boolean {
    if (!el) {
        return false
    }
    const element = el.nodeType === Node.ELEMENT_NODE
        ? el as Element
        : el.parentElement
    if (!element) {
        return false
    }
    if (INPUT_TAGS.has(element.tagName?.toLowerCase())) {
        return true
    }
    return (element as HTMLElement).isContentEditable === true
}

export function isMasked(el: Element | Node | null): boolean {
    if (!el)
        return false
    const element = el.nodeType === Node.ELEMENT_NODE
        ? el as Element
        : el.parentElement
    return !!element?.closest(MASK_SELECTOR)
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
