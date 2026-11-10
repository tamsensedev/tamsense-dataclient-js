// Метки перехода: utm кампании и tsr, метка одного человека из письма. Трекер берёт их из адреса страницы, держит на сессию
// и дописывает к ссылкам на другие сайты того же проекта, чтобы продукт знал, откуда человек пришёл на лендинг

export const MARK_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'tsr'] as const
export type MarkParam = typeof MARK_PARAMS[number]
export type Marks = Partial<Record<MarkParam, string>>

export interface SessionMarks {
    sessionId: string
    marks: Marks
}

const MAX_MARK_LENGTH = 200
const MARKS_KEY_SUFFIX = '_marks'
const IP_OR_LOCAL = /^(?:\d+\.){3}\d+$|^localhost$|^\[/
const WILDCARD_PREFIX = /^\*\./

function parsedUrl(href: string): URL | null {
    try {
        return new URL(href)
    }
    catch {
        return null
    }
}

export function marksOfUrl(href: string): Marks {
    const params = parsedUrl(href)?.searchParams
    const marks: Marks = {}
    for (const name of MARK_PARAMS) {
        const value = params?.get(name)?.trim()
        if (value) {
            marks[name] = value.slice(0, MAX_MARK_LENGTH)
        }
    }
    return marks
}

export function hasMarks(marks: Marks): boolean {
    return MARK_PARAMS.some(name => Boolean(marks[name]))
}

export function sameMarks(left: Marks, right: Marks): boolean {
    return MARK_PARAMS.every(name => (left[name] ?? '') === (right[name] ?? ''))
}

// Откуда пришли: адрес другого сайта без запроса; свой же сайт источником не считается
export function externalReferrer(referrer: string, host: string): string {
    const url = parsedUrl(referrer)
    if (!url || url.hostname === host) {
        return ''
    }
    return `${url.origin}${url.pathname}`
}

export function readSessionMarks(key: string): SessionMarks | null {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(`${key}${MARKS_KEY_SUFFIX}`) ?? 'null') as SessionMarks | null
        return typeof parsed?.sessionId === 'string' && typeof parsed.marks === 'object' && parsed.marks !== null ? parsed : null
    }
    catch {
        return null
    }
}

export function writeSessionMarks(key: string, value: SessionMarks) {
    try {
        sessionStorage.setItem(`${key}${MARKS_KEY_SUFFIX}`, JSON.stringify(value))
    }
    catch {}
}

// Последние две части имени: tamsense.com у my.tamsense.com; у адресов и localhost своего сайта нет
function siteOf(host: string): string | null {
    if (IP_OR_LOCAL.test(host)) {
        return null
    }
    const parts = host.split('.')
    return parts.length >= 2 ? parts.slice(-2).join('.') : null
}

function coveredBy(host: string, domain: string): boolean {
    const bare = domain.replace(WILDCARD_PREFIX, '').toLowerCase()
    return host === bare || host.endsWith(`.${bare}`)
}

// Ссылка ведёт на другой сайт того же проекта: тот же сайт второго уровня или домен из linkDomains
export function isProjectLink(host: string, currentHost: string, linkDomains: readonly string[]): boolean {
    if (host === currentHost) {
        return false
    }
    if (linkDomains.some(domain => coveredBy(host, domain))) {
        return true
    }
    const site = siteOf(currentHost)
    return site !== null && site === siteOf(host)
}

// Метки дописываются только те, которых в ссылке ещё нет: свои метки ссылки важнее
export function withMarks(href: string, marks: Marks): string {
    const url = parsedUrl(href)
    if (!url) {
        return href
    }
    for (const name of MARK_PARAMS) {
        const value = marks[name]
        if (value && !url.searchParams.has(name)) {
            url.searchParams.set(name, value)
        }
    }
    return url.toString()
}
