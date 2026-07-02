# TAMsense SDK

[![npm version](https://img.shields.io/npm/v/@tamsensedev/dataclient.svg)](https://www.npmjs.com/package/@tamsensedev/dataclient)
[![npm downloads](https://img.shields.io/npm/dm/@tamsensedev/dataclient.svg)](https://www.npmjs.com/package/@tamsensedev/dataclient)
[![license](https://img.shields.io/npm/l/@tamsensedev/dataclient.svg)](https://github.com/tamsensedev/dataclient-js/blob/main/LICENSE)

**[Website](https://tamsense.com)**

Capture frontend user behavior for TAMsense to detect friction across onboarding, activation, evaluation, and conversion to paid journeys.

TAMsense helps SaaS companies turn more free users into paying customers by generating specific product recommendations based on the analysis of user behavior across the entire product.

### Features

- **Session replay** — full video recording via rrweb
- **DOM snapshots** — serialized page structure for AI analysis
- **User actions** — clicks, inputs, form changes with element context
- **Auto idle management** — sessions auto-stop after inactivity, restart on interaction
- **Privacy first** — mask sensitive data with a single HTML attribute
- **Lightweight** — small bundle, no impact on page performance
- **Framework agnostic** — works with React, Vue, Nuxt, Next.js, Angular, or plain JS

**Looking to improve conversion to paid?** Support us on [Product Hunt](https://www.producthunt.com/products/tamsense?launch=tamsense)

---

## Why teams use TAMsense SDK

Teams use the SDK when they want clear, ready-to-act-on decisions instead of just raw events and dashboards.

With TAMsense SDK, you can:

- capture real user behavior across onboarding, activation, and evaluation flows
- give TAMsense behavioral signals in context: where users are in the journey, what they were trying to do, what happened before drop-off, and where friction blocks conversion
- understand where users struggle on the journey to pay
- feed the full TAMsense system that generates prioritized recommendations for what to fix first

---

## How it fits into TAMsense

TAMsense has three parts:

1. **SDK** — installed on your frontend to capture user actions in context: where they are in the journey, what they are trying to do, and where they hesitate, loop, or drop off
2. **Analysis Core** — process behavior data, detect friction patterns, and identify likely conversion blockers
3. **Web app** — shows recommendations, priorities, and suggested actions for your team

In short:

**Install the SDK → capture user behavior → TAMsense analyzes friction → your team gets prioritized solutions**

The SDK is open. The analysis layer and recommendation workflow are part of the full TAMsense product.

---

## Best fit

TAMsense SDK is a strong fit for:

- PLG and SaaS products
- teams working on onboarding, activation, and conversion to paid
- product, growth, and founder-led teams that already have traffic and product usage, but still struggle to prioritize what to fix
- companies that want decision-ready recommendations, not just more dashboards

---

## Quick start

### Install

```bash
npm install @tamsensedev/dataclient
```

### Initialize

```js
import { DataClient } from '@tamsensedev/dataclient'

const client = new DataClient({
    apiKey: 'YOUR_API_KEY'
})
```

### Or via CDN

```html
<script src="https://unpkg.com/@tamsensedev/dataclient/dist/index.global.js"></script>
<script>
  var client = new dataclient.DataClient({
    apiKey: 'YOUR_API_KEY'
  });
</script>
```

---

## API

### `new DataClient(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | `''` | Your project API key |
| `idleTimeout` | `number` | `3600000` | Session idle timeout in ms (default 1h) |
| `batchSize` | `number` | `5` | Events per batch |
| `flushInterval` | `number` | `5000` | Flush interval in ms |
| `scoped` | `string` | `''` | Attribute name that narrows tracking to a specific subtree when present on the page. See [Scoped mode](#scoped-mode). |
| `maskAllInputs` | `boolean` | `true` | Mask everything users type or select — inputs, textareas, selects, contenteditable — in both recordings and collected events. Enabled by default; set to `false` explicitly to capture raw input values. See [Data masking](#data-masking). |
| `version` | `string` | — | Optional app/release version stamped on every event (e.g. `'v1.4.2'` or a git SHA). Lets you attribute captured behavior to a specific production build. See [Versioning](#versioning). |

### `client.setUser(userId)`

Link the current session to an authenticated user.

```js
client.setUser('user_123')
```

### `client.excludeSession(reason?)`

Exclude the current session from analytics. Stops all tracking immediately.

```js
client.excludeSession('internal user')
```

### Data masking

**All user input is masked by default.** Everything a user types or selects — `<input>`, `<textarea>`, `<select>`, `contenteditable` elements — is replaced with `*` characters in session replays, DOM snapshots, and action events before leaving the browser. Only the length of the value is preserved.

To capture raw input values, opt out explicitly:

```js
new DataClient({
  apiKey: 'YOUR_API_KEY',
  maskAllInputs: false, // capture what users type (passwords stay masked)
})
```

Passwords are always masked automatically, even with `maskAllInputs: false`.

To mask other sensitive content (not just inputs), add the `dataclient-mask` attribute — it fully replaces text with `*` in both recordings and collected events:

```html
<div dataclient-mask>
  <p>John Doe</p>        <!-- "********" -->
  <input value="secret">  <!-- "******" -->
</div>
```

---

## Scoped mode

Pass `scoped` with an attribute name to make tracking page-aware:

- If the attribute exists on the current page, the SDK tracks **only inside** that element. DOM snapshots, mutations, and user actions are limited to that subtree, and everything outside is masked in the session replay.
- If the attribute does not exist on the current page, the SDK tracks **the whole page** as usual.

The SDK re-evaluates as the DOM changes (useful for SPAs and widgets that mount asynchronously) — when the attribute appears, the scope narrows; when it goes away, the scope widens back.

```html
<!-- Pages where you want to limit tracking -->
<div dataclient-root>
  <!-- Only this subtree is tracked -->
</div>

<!-- Pages without the attribute are tracked in full -->
```

```js
new DataClient({
  apiKey: 'YOUR_API_KEY',
  scoped: 'dataclient-root',
})
```

The attribute name is up to you — `dataclient-root` is just a convention. Any HTML-valid attribute name works (e.g. `data-my-widget`).

---

## Versioning

Pass `version` to stamp every captured event with the release it came from. This is optional — omit it and events are sent without a version.

```js
new DataClient({
  apiKey: 'YOUR_API_KEY',
  version: 'v1.4.2',
})
```

The value is opaque — use whatever identifies a production build for you: a semver tag, a git commit SHA, a CI build number. In most setups your CI already exposes it as an env var, so you can wire it in automatically:

```js
new DataClient({
  apiKey: 'YOUR_API_KEY',
  version: process.env.VERCEL_GIT_COMMIT_SHA, // or GITHUB_SHA, CI_COMMIT_SHA, etc.
})
```

Because the version travels with every event, TAMsense can attribute captured behavior to a specific build and compare what users do before and after a change ships — regardless of the order in which features were deployed.

---

## Framework examples

### Nuxt

```js
// plugins/dataclient.client.ts
import { DataClient } from '@tamsensedev/dataclient'

export default defineNuxtPlugin(() => {
    const client = new DataClient({
        apiKey: 'YOUR_API_KEY'
    })
})
```

### React

```js
// app.tsx
import { DataClient } from '@tamsensedev/dataclient'

const client = new DataClient({
    apiKey: 'YOUR_API_KEY'
})

// After login:
client.setUser(user.id)
```

### Vue

```js
// main.ts
import { DataClient } from '@tamsensedev/dataclient'

const client = new DataClient({
    apiKey: 'YOUR_API_KEY'
})

app.provide('dataclient', client)
```

### Next.js

```js
// app/providers.tsx
'use client'

import { useEffect, useRef } from 'react'
import { DataClient } from '@tamsensedev/dataclient'

export function DataClientProvider() {
  const clientRef = useRef<DataClient | null>(null)

  useEffect(() => {
    clientRef.current = new DataClient({
      apiKey: 'YOUR_API_KEY'
    })
  }, [])

  return null
}

// app/layout.tsx
import { DataClientProvider } from './providers'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <DataClientProvider />
        {children}
      </body>
    </html>
  )
}
```

### Angular

```ts
// app.component.ts
import { Component, OnInit } from '@angular/core'
import { DataClient } from '@tamsensedev/dataclient'

@Component({
    selector: 'app-root',
    template: '<router-outlet></router-outlet>'
})
export class AppComponent implements OnInit {
    private client: DataClient | null = null

    ngOnInit() {
        this.client = new DataClient({
            apiKey: 'YOUR_API_KEY'
        })
    }
}
```

---

## What this SDK is

TAMsense SDK is:

- a frontend behavior capture layer for TAMsense
- a way to collect user interaction data from key product journeys
- an input to TAMsense analysis agents and recommendation workflows

## What this SDK is not

TAMsense SDK is not:

- a standalone product analytics platform
- a session replay replacement
- the full TAMsense recommendation engine
- a complete self-serve conversion optimization tool on its own

---
