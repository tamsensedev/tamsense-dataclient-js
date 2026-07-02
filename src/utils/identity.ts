export function getDeviceId(key: string): string {
    let id = localStorage.getItem(key)
    if (!id) {
        id = generateId()
        localStorage.setItem(key, id)
    }
    return id
}

export function generateId(): string {
    const ts = Date.now().toString(36)
    const rand = Math.random().toString(36).substring(2, 12)
    return `${ts}-${rand}`
}

interface StoredSession {
    id: string
    ts: number
}

function readSession(key: string): StoredSession | null {
    try {
        const raw = sessionStorage.getItem(key)
        if (!raw) {
            return null
        }
        const parsed = JSON.parse(raw) as StoredSession
        if (typeof parsed?.id === 'string' && typeof parsed?.ts === 'number') {
            return parsed
        }
    }
    catch {}
    return null
}

export function getSessionId(key: string, maxAgeMs: number): string {
    const stored = readSession(key)
    if (stored && Date.now() - stored.ts < maxAgeMs) {
        touchSession(key, stored.id)
        return stored.id
    }
    const id = generateId()
    touchSession(key, id)
    return id
}

export function touchSession(key: string, id: string) {
    try {
        sessionStorage.setItem(key, JSON.stringify({ id, ts: Date.now() }))
    }
    catch {}
}

export function clearSession(key: string) {
    try {
        sessionStorage.removeItem(key)
    }
    catch {}
}
