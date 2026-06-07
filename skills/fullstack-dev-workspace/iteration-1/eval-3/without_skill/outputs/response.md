# Minimal Express Weather API

## Project Structure

```
weather-api/
├── src/
│   ├── index.js              # Entry point, starts server + background job
│   ├── app.js                # Express app setup (middleware, routes, error handler)
│   ├── routes/
│   │   └── forecasts.js      # GET /forecasts, GET /forecasts/:city
│   ├── services/
│   │   └── weather.js        # Fetch + transform external weather data
│   ├── jobs/
│   │   └── refresh.js        # Periodic background refresh
│   ├── middleware/
│   │   └── errorHandler.js   # Centralized error handling middleware
│   └── store.js              # In-memory data store (simple Map)
├── package.json
├── .env.example
└── .gitignore
```

## Architecture Decisions

- **No auth layer** — public read-only API, no keys or tokens.
- **In-memory store** — forecasts are small and refresh periodically; no database needed. A `Map` keyed by city slug gives O(1) lookups and trivial eviction.
- **Background refresh** — a `setInterval` job runs every N minutes, fetches from the external weather service, and overwrites the store atomically. The store is never locked; reads always see the latest complete dataset.
- **Centralized error handler** — all route errors flow through one Express error middleware. External service failures during refresh are logged but don't crash the process; stale data is served until the next successful refresh.
- **Health check** — `/health` returns `{ status: "ok", lastRefresh: <ISO timestamp> }` so callers can detect stale data.

## Code

### `package.json`

```json
{
  "name": "weather-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "dotenv": "^16.4.0"
  }
}
```

### `.env.example`

```
PORT=3000
WEATHER_API_URL=https://api.weather.example.com/v1/forecasts
WEATHER_API_KEY=your-key-here
REFRESH_INTERVAL_MS=600000
```

### `src/store.js`

```js
// Simple in-memory store. Written atomically by the refresh job,
// read concurrently by route handlers. No locking needed in Node's
// single-threaded event loop — the Map reference swap is synchronous.

const store = {
  forecasts: new Map(),   // city slug → forecast object
  lastRefresh: null,      // ISO timestamp of last successful refresh
  lastError: null,        // last error object (null when healthy)
};

module.exports = store;
```

### `src/services/weather.js`

```js
const store = require('../store');

const API_URL = process.env.WEATHER_API_URL;
const API_KEY = process.env.WEATHER_API_KEY;

/**
 * Fetch forecasts from the external weather service and update the store.
 * Returns true on success, false on failure.
 */
async function refreshForecasts() {
  try {
    const res = await fetch(`${API_URL}?key=${API_KEY}`);
    if (!res.ok) {
      throw new Error(`Weather API responded ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    // Rebuild the map atomically — assign to a new Map then swap.
    const next = new Map();
    for (const item of data.forecasts) {
      const slug = item.city.toLowerCase().replace(/\s+/g, '-');
      next.set(slug, {
        city: item.city,
        temperature: item.temperature,
        conditions: item.conditions,
        updatedAt: item.updatedAt,
      });
    }

    store.forecasts = next;
    store.lastRefresh = new Date().toISOString();
    store.lastError = null;
    return true;
  } catch (err) {
    store.lastError = err;
    console.error('[weather] Refresh failed:', err.message);
    return false;
  }
}

module.exports = { refreshForecasts };
```

### `src/jobs/refresh.js`

```js
const { refreshForecasts } = require('../services/weather');

const INTERVAL_MS = parseInt(process.env.REFRESH_INTERVAL_MS, 10) || 600_000; // 10 min default

let timer = null;

async function tick() {
  console.log('[refresh] Starting forecast refresh');
  await refreshForecasts();
  console.log('[refresh] Completed');
}

function start() {
  // Fire once immediately so data is available on boot
  tick().catch((err) => console.error('[refresh] Initial refresh failed:', err.message));
  timer = setInterval(() => {
    tick().catch((err) => console.error('[refresh] Periodic refresh failed:', err.message));
  }, INTERVAL_MS);
  console.log(`[refresh] Scheduled every ${INTERVAL_MS / 1000}s`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop };
```

### `src/middleware/errorHandler.js`

```js
/**
 * Centralized error handler. All route errors should be passed here
 * via next(err). Returns JSON with a consistent shape.
 */
function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  if (status >= 500) {
    console.error('[error]', err.stack || err);
  }

  res.status(status).json({ error: { status, message } });
}

module.exports = errorHandler;
```

### `src/routes/forecasts.js`

```js
const { Router } = require('express');
const store = require('../store');

const router = Router();

// GET /forecasts — list all forecasts
router.get('/', (_req, res) => {
  const forecasts = Array.from(store.forecasts.values());
  res.json({ data: forecasts, count: forecasts.length });
});

// GET /forecasts/:city — single city forecast
router.get('/:city', (req, res, next) => {
  const slug = req.params.city.toLowerCase();
  const forecast = store.forecasts.get(slug);

  if (!forecast) {
    const err = new Error(`Forecast not found for city: ${req.params.city}`);
    err.status = 404;
    return next(err);
  }

  res.json({ data: forecast });
});

module.exports = router;
```

### `src/app.js`

```js
const express = require('express');
const errorHandler = require('./middleware/errorHandler');
const forecastsRouter = require('./routes/forecasts');
const store = require('./store');

const app = express();

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  const healthy = store.lastError === null;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    lastRefresh: store.lastRefresh,
    ...(store.lastError && { lastError: store.lastError.message }),
  });
});

// Routes
app.use('/forecasts', forecastsRouter);

// 404 catch-all
app.use((_req, res, _next) => {
  res.status(404).json({ error: { status: 404, message: 'Not found' } });
});

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
```

### `src/index.js`

```js
require('dotenv').config();

const app = require('./app');
const { start, stop } = require('./jobs/refresh');

const PORT = parseInt(process.env.PORT, 10) || 3000;

start();

const server = app.listen(PORT, () => {
  console.log(`[server] Weather API listening on :${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[server] Received ${signal}, shutting down`);
  stop();
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10s if connections hang
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

## Error Handling Strategy

| Scenario | Behavior |
|---|---|
| External weather API down during refresh | Log error, keep serving stale data, set `store.lastError`. Health check returns 503. |
| External API returns non-2xx | Same as above — caught in `refreshForecasts`, never crashes the process. |
| Unknown city in GET `/forecasts/:city` | Returns 404 with `{ error: { status: 404, message: "Forecast not found for city: x" } }`. |
| Unhandled route | Returns 404 via catch-all middleware. |
| Unexpected route handler error | Caught by centralized error middleware, returns 500 with generic message, logs stack trace. |
| No data yet (first refresh hasn't completed) | GET `/forecasts` returns `{ data: [], count: 0 }`. Health check returns 503 until first successful refresh. |

## Key Design Choices

1. **No database** — forecasts are ephemeral and fully replaced on each refresh. An in-memory Map is the simplest correct store. If persistence were needed later, swap `store.js` for a Redis/Postgres adapter without touching routes.

2. **Atomic Map swap** — `refreshForecasts` builds a new Map and assigns it in one statement. Route handlers that already hold a reference to the old Map finish their synchronous read; the next request picks up the new Map. No race conditions in Node's event loop.

3. **Health check reflects data freshness** — `/health` doesn't just say "the process is up." It reports whether the last refresh succeeded and when it happened, so callers can decide if data is too stale for their use case.

4. **Graceful shutdown** — SIGTERM/SIGINT stop the refresh timer and close the HTTP server. A 10-second forced exit prevents hanging connections from blocking deploys.

5. **No auth middleware** — per requirements, this is a public API. If auth is added later, a single `app.use(authMiddleware)` before routes covers everything.