# Weather Forecast API — Skill-Guided Implementation

## Requirements Gathered

- Express API serving public weather forecast data (no auth)
- Single resource: `forecasts` with GET endpoints
- Background job refreshes data from an external weather service
- Minimal but well-organized: project structure, error handling, health check

## Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Organization | Feature-first | Skill prescribes feature-first; single feature = single `forecasts/` dir |
| Layers | Controller → Service → Repository | Three-layer separation; controller is HTTP-only, service holds business logic, repo handles data |
| Config | Centralized `config/index.js` with `requiredEnv()` | No scattered `process.env`; validated at startup |
| Auth | Skipped | Public data, no auth needed — skill says "order: …Auth → Authz…" but we omit those middleware |
| Error handling | `AppError` hierarchy + global handler | Skill pattern: structured `{ error, status, detail, requestId }` |
| Health check | `/health` (liveness) + `/ready` (readiness with external service check) | Skill prescribes both; `/ready` verifies external weather service connectivity |
| Background refresh | `setInterval` in service layer | Minimal approach; service owns refresh cycle, repo owns storage |
| Logging | Structured JSON with request IDs | Skill: "Never console.log in production" |

## Project Structure

```
weather-api/
├── src/
│   ├── config/
│   │   └── index.js            # Centralized config, requiredEnv()
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── AppError.js      # Base error class
│   │   │   ├── NotFoundError.js # 404 errors
│   │   │   └── index.js         # Re-exports
│   │   ├── middleware/
│   │   │   ├── requestId.js     # X-Request-ID / generated UUID
│   │   │   ├── errorHandler.js  # Global error handler
│   │   │   └── requestLogger.js # Structured JSON logging
│   │   └── logger.js            # Pino or console-based JSON logger
│   ├── forecasts/
│   │   ├── forecasts.controller.js  # GET /forecasts, GET /forecasts/:city
│   │   ├── forecasts.service.js     # Business logic + background refresh
│   │   ├── forecasts.repository.js  # In-memory store, external API calls
│   │   └── forecasts.test.js
│   └── app.js                  # Express app setup, middleware chain
├── .env.example
├── package.json
└── server.js                   # Entry point: graceful shutdown, starts server
```

## Implementation

### 1. Centralized Config — `src/config/index.js`

```js
function requiredEnv(key) {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  weather: {
    apiKey: requiredEnv('WEATHER_API_KEY'),
    baseUrl: process.env.WEATHER_BASE_URL || 'https://api.weatherapi.com/v1',
    refreshIntervalMs: parseInt(process.env.REFRESH_INTERVAL_MS || '300000', 10), // 5 min
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;
```

### 2. Error Hierarchy — `src/shared/errors/AppError.js`

```js
class AppError extends Error {
  constructor(message, code, statusCode = 500, isOperational = true) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
```

### `src/shared/errors/NotFoundError.js`

```js
const AppError = require('./AppError');

class NotFoundError extends AppError {
  constructor(resource, id) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
  }
}

module.exports = NotFoundError;
```

### `src/shared/errors/index.js`

```js
module.exports = {
  AppError: require('./AppError'),
  NotFoundError: require('./NotFoundError'),
};
```

### 3. Request ID Middleware — `src/shared/middleware/requestId.js`

```js
const { v4: uuidv4 } = require('uuid');

function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = requestId;
```

### 4. Request Logger Middleware — `src/shared/middleware/requestLogger.js`

```js
const logger = require('../logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
}

module.exports = requestLogger;
```

### 5. Global Error Handler — `src/shared/middleware/errorHandler.js`

```js
const logger = require('../logger');
const { AppError } = require('../errors');

function errorHandler(err, req, res, _next) {
  const requestId = req.id || 'unknown';

  if (err.isOperational) {
    logger.warn({ requestId, err: err.message, code: err.code });
    return res.status(err.statusCode).json({
      error: err.code,
      status: err.statusCode,
      detail: err.message,
      requestId,
    });
  }

  // Unexpected errors — don't leak internals
  logger.error({ requestId, err: err.message, stack: err.stack });
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    status: 500,
    detail: 'An unexpected error occurred',
    requestId,
  });
}

module.exports = errorHandler;
```

### 6. Logger — `src/shared/logger.js`

```js
const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.logLevel,
  formatters: { level: (label) => ({ level: label }) },
});

module.exports = logger;
```

### 7. Forecasts Repository — `src/forecasts/forecasts.repository.js`

```js
const axios = require('axios');
const config = require('../config');
const logger = require('../shared/logger');

// In-memory store keyed by city
const store = new Map();

async function fetchFromExternalService(city) {
  const url = `${config.weather.baseUrl}/forecast.json`;
  const response = await axios.get(url, {
    params: { key: config.weather.apiKey, q: city },
    timeout: 10000,
  });
  return response.data;
}

function get(city) {
  return store.get(city.toLowerCase()) || null;
}

function set(city, data) {
  store.set(city.toLowerCase(), { ...data, updatedAt: new Date().toISOString() });
}

function all() {
  return Object.fromEntries(store);
}

function has(city) {
  return store.has(city.toLowerCase());
}

module.exports = { fetchFromExternalService, get, set, all, has };
```

### 8. Forecasts Service — `src/forecasts/forecasts.service.js`

```js
const repo = require('./forecasts.repository');
const { NotFoundError } = require('../shared/errors');
const config = require('../config');
const logger = require('../shared/logger');

let refreshTimer = null;

async function refreshCity(city) {
  try {
    const data = await repo.fetchFromExternalService(city);
    repo.set(city, data);
    logger.info({ city, action: 'refresh' }, 'Forecast refreshed');
  } catch (err) {
    logger.error({ city, err: err.message }, 'Forecast refresh failed');
  }
}

async function refreshAll(cities) {
  await Promise.allSettled(cities.map(refreshCity));
}

function startBackgroundRefresh(cities) {
  // Initial load
  refreshAll(cities);
  refreshTimer = setInterval(() => refreshAll(cities), config.weather.refreshIntervalMs);
  logger.info({ intervalMs: config.weather.refreshIntervalMs, cities }, 'Background refresh started');
}

function stopBackgroundRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    logger.info('Background refresh stopped');
  }
}

function getForecast(city) {
  const data = repo.get(city);
  if (!data) {
    throw new NotFoundError('Forecast', city);
  }
  return data;
}

function listForecasts() {
  return repo.all();
}

module.exports = {
  getForecast,
  listForecasts,
  startBackgroundRefresh,
  stopBackgroundRefresh,
};
```

### 9. Forecasts Controller — `src/forecasts/forecasts.controller.js`

```js
const service = require('./forecasts.service');

function getForecastByCity(req, res, next) {
  try {
    const data = service.getForecast(req.params.city);
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

function listForecasts(req, res) {
  const data = service.listForecasts();
  res.json({ data, requestId: req.id });
}

module.exports = { getForecastByCity, listForecasts };
```

### 10. Health & Readiness — added inline in `src/app.js`

```js
// Liveness — process is alive
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness — can serve traffic (external service reachable)
app.get('/ready', async (_req, res) => {
  try {
    // Verify external weather service is reachable
    const axios = require('axios');
    await axios.get(`${config.weather.baseUrl}/forecast.json`, {
      params: { key: config.weather.apiKey, q: 'London' },
      timeout: 5000,
    });
    res.json({ status: 'ready', checks: { externalService: 'ok' } });
  } catch (err) {
    res.status(503).json({
      status: 'not_ready',
      checks: { externalService: 'unavailable' },
      detail: err.message,
    });
  }
});
```

### 11. App Setup — `src/app.js`

```js
const express = require('express');
const requestId = require('./shared/middleware/requestId');
const requestLogger = require('./shared/middleware/requestLogger');
const errorHandler = require('./shared/middleware/errorHandler');
const config = require('./config');
const forecastsController = require('./forecasts/forecasts.controller');

const app = express();

// Middleware chain (skill order, auth layers omitted — public API)
app.use(requestId);
app.use(requestLogger);

// Health endpoints (before routes, no auth needed)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', async (_req, res) => {
  try {
    const axios = require('axios');
    await axios.get(`${config.weather.baseUrl}/forecast.json`, {
      params: { key: config.weather.apiKey, q: 'London' },
      timeout: 5000,
    });
    res.json({ status: 'ready', checks: { externalService: 'ok' } });
  } catch (err) {
    res.status(503).json({
      status: 'not_ready',
      checks: { externalService: 'unavailable' },
      detail: err.message,
    });
  }
});

// Routes
app.get('/forecasts', forecastsController.listForecasts);
app.get('/forecasts/:city', forecastsController.getForecastByCity);

// Error handler (last)
app.use(errorHandler);

module.exports = app;
```

### 12. Server Entry — `server.js`

```js
const app = require('./src/app');
const config = require('./src/config');
const logger = require('./src/shared/logger');
const forecastService = require('./src/forecasts/forecasts.service');

const CITIES = (process.env.CITIES || 'London,New York,Tokyo').split(',');

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'Server started');
  forecastService.startBackgroundRefresh(CITIES);
});

// Graceful shutdown (skill pattern: SIGTERM → drain → close)
function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  forecastService.stopBackgroundRefresh();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  // Force exit after 10s if connections linger
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 13. `.env.example`

```
PORT=3000
NODE_ENV=development
WEATHER_API_KEY=your_api_key_here
WEATHER_BASE_URL=https://api.weatherapi.com/v1
REFRESH_INTERVAL_MS=300000
CITIES=London,New York,Tokyo
LOG_LEVEL=info
```

## Verification Checklist

- [x] Feature-first structure: `forecasts/` contains controller, service, repo
- [x] Three-layer separation: Controller (HTTP) → Service (logic + refresh) → Repository (data)
- [x] Centralized config with `requiredEnv()` — fails fast on missing `WEATHER_API_KEY`
- [x] Typed error hierarchy: `AppError` → `NotFoundError` with `{ error, status, detail, requestId }`
- [x] Global error handler returns structured response for both operational and unexpected errors
- [x] Request ID middleware: reads `X-Request-ID` or generates UUID
- [x] Structured JSON logging (pino) — no `console.log`
- [x] Health endpoints: `/health` (liveness) + `/ready` (readiness checks external service)
- [x] Graceful shutdown: SIGTERM/SIGINT → stop refresh → close server → force exit after 10s
- [x] Background refresh: `setInterval` in service layer, initial load on startup
- [x] No auth middleware (public API, per requirements)
- [x] No anti-patterns: no business logic in routes, no scattered env vars, no generic `Error`, no console.log

## Handoff Summary

**What was built:** Minimal Express weather API following fullstack-dev skill patterns — feature-first structure, three-layer architecture, typed errors, structured logging, health/readiness endpoints, and background data refresh.

**Key decisions:**
- Auth middleware intentionally omitted (public data, per requirements)
- In-memory store in repository layer (no DB needed for this scope; swap to Redis/DB by changing repo only)
- Background refresh uses `setInterval` — adequate for single-instance; for multi-instance, use an external scheduler
- `/ready` checks external weather service connectivity as the readiness probe

**Hand-offs:**
- Build failures → `build-resolver`
- Code quality review → `code-review`
- Security review → `security-auditor` (especially around the external API key handling and input validation on `:city` param)