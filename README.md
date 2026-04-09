# TAMsense SDK

Capture frontend user behavior for TAMsense to detect friction across onboarding, activation, evaluation, and conversion to paid journeys.

TAMsense helps SaaS companies turn more free users into paying customers by generating specific product recommendations based on the analysis of user behavior across the entire product

**Looking to improve conversion to paid?** Support us on Product Hunt by subscribing for launch updates https://www.producthunt.com/products/tamsense?launch=tamsense


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
| `endpoint` | `string` | `'https://my.tamsense.com/api/scenes2'` | Data endpoint |
| `idleTimeout` | `number` | `3600000` | Session idle timeout in ms (default 1h) |
| `batchSize` | `number` | `5` | Events per batch |
| `flushInterval` | `number` | `5000` | Flush interval in ms |

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

Add the `dataclient-mask` attribute to mask sensitive content in both recordings and collected events.

```html
<div dataclient-mask>
  <p>John Doe</p>        <!-- "Jo******" -->
  <input value="secret">  <!-- "se****" -->
</div>
```

Passwords are always masked automatically.

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
