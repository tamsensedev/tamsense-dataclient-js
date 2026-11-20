export type MaskingMode = 'all' | 'typed' | 'marked'
export type PrivacyAction = 'hide' | 'skip'

export interface PrivacyRule {
    target: string
    action: PrivacyAction
}

export interface RemoteSettings {
    masking: MaskingMode
    rules: PrivacyRule[]
    record: boolean
}

export const DEFAULT_SETTINGS: RemoteSettings = { masking: 'typed', rules: [], record: true }

const MASKING_MODES: readonly string[] = ['all', 'typed', 'marked']
const ACTIONS: readonly string[] = ['hide', 'skip']
const STORAGE_PREFIX = 'dataclient_settings_'
const FETCH_TIMEOUT_MS = 1500
const EVENTS_PATH = /\/events\/?$/

export function settingsUrl(endpoint: string, apiKey: string): string | null {
    if (!apiKey || !EVENTS_PATH.test(endpoint)) {
        return null
    }
    return `${endpoint.replace(EVENTS_PATH, '/tracker-config')}?key=${encodeURIComponent(apiKey)}`
}

function isRule(value: unknown): value is PrivacyRule {
    if (typeof value !== 'object' || value === null) {
        return false
    }
    const { target, action } = value as Record<string, unknown>
    return typeof target === 'string' && target.trim() !== '' && ACTIONS.includes(action as string)
}

export function parseSettings(value: unknown): RemoteSettings | null {
    if (typeof value !== 'object' || value === null) {
        return null
    }
    const { masking, rules, record } = value as Record<string, unknown>
    if (!MASKING_MODES.includes(masking as string) || !Array.isArray(rules)) {
        return null
    }
    return { masking: masking as MaskingMode, rules: rules.filter(isRule).map(rule => ({ target: rule.target.trim(), action: rule.action })), record: record !== false }
}

export function pageRuleMatches(pattern: string, path: string): boolean {
    const source = pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    return new RegExp(`^${source}$`).test(path)
}

export function isPageSkipped(rules: PrivacyRule[], path: string): boolean {
    return rules.some(rule => rule.action === 'skip' && rule.target.startsWith('/') && pageRuleMatches(rule.target, path))
}

export function selectorRules(rules: PrivacyRule[], action: PrivacyAction): string[] {
    return rules.filter(rule => rule.action === action && !rule.target.startsWith('/')).map(rule => rule.target)
}

export function readCachedSettings(apiKey: string): RemoteSettings | null {
    try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${apiKey}`)
        return raw ? parseSettings(JSON.parse(raw)) : null
    }
    catch {
        return null
    }
}

export function writeCachedSettings(apiKey: string, settings: RemoteSettings) {
    try {
        localStorage.setItem(`${STORAGE_PREFIX}${apiKey}`, JSON.stringify(settings))
    }
    catch {}
}

export async function fetchSettings(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<RemoteSettings | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit' })
        return response.ok ? parseSettings(await response.json()) : null
    }
    catch {
        return null
    }
    finally {
        clearTimeout(timer)
    }
}
