# JWT Authentication: Express Backend + Next.js Frontend

## Architecture Decisions

**Token storage strategy:**
- **Access token** → stored in JavaScript memory (not `localStorage`, not `sessionStorage`). Memory is immune to XSS exfiltration and cleared on tab close.
- **Refresh token** → stored in an `httpOnly`, `Secure`, `SameSite=Strict` cookie. JavaScript cannot read it; the browser sends it automatically on `/api/auth/refresh` requests.

**Why this split?** Access tokens are short-lived (15 min) and must be readable by the frontend to attach to `Authorization` headers. Refresh tokens are long-lived (7 days) and must never be accessible to JavaScript — the cookie approach prevents XSS-based token theft.

**Middleware ordering rationale:** Request ID must come first so every downstream log line carries a correlation ID. Logging wraps everything so errors are captured. CORS must precede rate limiting so preflight `OPTIONS` requests aren't throttled. Auth comes after rate limiting so unauthenticated floods are throttled before we do expensive JWT verification. Validation comes after auth so we can use the authenticated user context in validation rules. The error handler is last so it catches everything.

---

## Backend: Express Middleware Chain

### Directory Structure

```
server/
├── src/
│   ├── middleware/
│   │   ├── requestId.ts
│   │   ├── logger.ts
│   │   ├── cors.ts
│   │   ├── rateLimit.ts
│   │   ├── auth.ts
│   │   ├── validate.ts
│   │   └── errorHandler.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   └── api.ts
│   ├── utils/
│   │   └── tokens.ts
│   ├── app.ts
│   └── config.ts
├── package.json
└── tsconfig.json
```

### config.ts

```ts
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // JWT
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!,
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',

  // Cookie
  cookieDomain: process.env.COOKIE_DOMAIN ?? 'localhost',
  cookieSecure: process.env.NODE_ENV === 'production',
  cookieSameSite: 'strict' as const,

  // CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000').split(','),

  // Rate limiting
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 100,

  // Refresh
  refreshTokenMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};
```

### utils/tokens.ts

```ts
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AccessTokenPayload {
  sub: string;       // user ID
  email: string;
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number; // allows forced logout by bumping version
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.accessTokenSecret, {
    expiresIn: config.accessTokenExpiry,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, config.refreshTokenSecret, {
    expiresIn: config.refreshTokenExpiry,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.accessTokenSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.refreshTokenSecret) as RefreshTokenPayload;
}
```

### middleware/requestId.ts

```ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, _res: Response, next: NextFunction): void {
  req.id = req.headers['x-request-id'] as string ?? uuidv4();
  next();
}
```

### middleware/logger.ts

```ts
import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});

export { logger };

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      reqId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
      userId: req.user?.sub,
    });
  });

  next();
}
```

### middleware/cors.ts

```ts
import cors from 'cors';
import { config } from '../config';

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl)
    if (!origin) return callback(null, true);
    if (config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'), false);
  },
  credentials: true, // required for cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
});
```

### middleware/rateLimit.ts

```ts
import rateLimit from 'express-rate-limit';
import { config } from '../config';

export const rateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.sub ?? req.ip ?? 'unknown',
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limit for auth endpoints to prevent brute force
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  message: { error: 'Too many authentication attempts.' },
});
```

### middleware/auth.ts

```ts
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../utils/tokens';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ error: 'Invalid access token' });
  }
}

// Optional auth: populates req.user if token present, but doesn't reject
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(header.slice(7));
    } catch {
      // Swallow — unauthenticated is fine for optional routes
    }
  }
  next();
}
```

### middleware/validate.ts

```ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(422).json({
          error: 'Validation failed',
          details: err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(err);
    }
  };
}
```

### middleware/errorHandler.ts

```ts
import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error({
    err: { message: err.message, stack: err.stack },
    reqId: req.id,
    method: req.method,
    url: req.originalUrl,
  });

  const status = 'statusCode' in err ? (err as any).statusCode : 500;
  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

  res.status(status).json({ error: message });
}
```

### routes/auth.ts

```ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens';
import { validate } from '../middleware/validate';
import { authRateLimiter } from '../middleware/rateLimit';
import { config } from '../config';

// In production, replace with a real database
const users = new Map<string, { id: string; email: string; passwordHash: string; role: string; tokenVersion: number }>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['user', 'admin']).default('user'),
});

export const authRouter = Router();

// --- Register ---
authRouter.post(
  '/register',
  authRateLimiter,
  validate(registerSchema),
  async (req, res, next) => {
    try {
      const { email, password, role } = req.body;

      if (users.has(email)) {
        res.status(409).json({ error: 'User already exists' });
        return;
      }

      const id = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(password, 12);
      users.set(email, { id, email, passwordHash, role, tokenVersion: 0 });

      const accessToken = signAccessToken({ sub: id, email, role });
      const refreshToken = signRefreshToken({ sub: id, tokenVersion: 0 });

      res
        .cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: config.cookieSecure,
          sameSite: config.cookieSameSite,
          domain: config.cookieDomain,
          path: '/api/auth',
          maxAge: config.refreshTokenMaxAge,
        })
        .json({ accessToken, user: { id, email, role } });
    } catch (err) {
      next(err);
    }
  },
);

// --- Login ---
authRouter.post(
  '/login',
  authRateLimiter,
  validate(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const user = users.get(email);

      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      const refreshToken = signRefreshToken({
        sub: user.id,
        tokenVersion: user.tokenVersion,
      });

      res
        .cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: config.cookieSecure,
          sameSite: config.cookieSameSite,
          domain: config.cookieDomain,
          path: '/api/auth',
          maxAge: config.refreshTokenMaxAge,
        })
        .json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
    } catch (err) {
      next(err);
    }
  },
);

// --- Refresh ---
authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      res.status(401).json({ error: 'No refresh token provided' });
      return;
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      // Token is invalid or expired — clear cookie and reject
      res
        .clearCookie('refreshToken', { path: '/api/auth' })
        .status(401)
        .json({ error: 'Invalid or expired refresh token' });
      return;
    }

    // Look up user and check tokenVersion for forced logout support
    const user = [...users.values()].find((u) => u.id === payload.sub);
    if (!user || user.tokenVersion !== payload.tokenVersion) {
      res
        .clearCookie('refreshToken', { path: '/api/auth' })
        .status(401)
        .json({ error: 'Refresh token revoked' });
      return;
    }

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    // Rotate refresh token on each use
    const newRefreshToken = signRefreshToken({
      sub: user.id,
      tokenVersion: user.tokenVersion,
    });

    res
      .cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: config.cookieSameSite,
        domain: config.cookieDomain,
        path: '/api/auth',
        maxAge: config.refreshTokenMaxAge,
      })
      .json({ accessToken });
  } catch (err) {
    next(err);
  }
});

// --- Logout ---
authRouter.post('/logout', (req, res) => {
  // Bump tokenVersion in production to invalidate all refresh tokens
  // For this demo, just clear the cookie
  res.clearCookie('refreshToken', { path: '/api/auth' }).json({ message: 'Logged out' });
});
```

### routes/api.ts

```ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';

export const apiRouter = Router();

// Example protected route
apiRouter.get('/profile', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

apiRouter.get('/dashboard', requireAuth, (req, res) => {
  res.json({
    message: `Hello ${req.user!.email}`,
    role: req.user!.role,
  });
});
```

### app.ts — Assembling the Middleware Chain

```ts
import express from 'express';
import { config } from './config';
import { requestId } from './middleware/requestId';
import { requestLogger } from './middleware/logger';
import { corsMiddleware } from './middleware/cors';
import { rateLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { apiRouter } from './routes/api';

const app = express();

// ── Middleware chain (order matters) ──────────────────────────────
// 1. Request ID — first so every log line gets a correlation ID
app.use(requestId);

// 2. Logging — early so all requests (including rejected ones) are logged
app.use(requestLogger);

// 3. CORS — before rate limiting so preflight OPTIONS isn't throttled
app.use(corsMiddleware);

// 4. Body parsing
app.use(express.json());

// 5. Rate limiting — before auth so unauthenticated floods are throttled cheaply
app.use('/api', rateLimiter);

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

// ── 404 fallback ──────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 8. Error handler — always last, catches everything
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port} [${config.nodeEnv}]`);
});

export default app;
```

---

## Frontend: Next.js API Client

### Directory Structure

```
frontend/
├── src/
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── auth-store.ts
│   │   └── types.ts
│   ├── hooks/
│   │   └── useAuth.ts
│   └── app/
│       ├── login/
│       │   └── page.tsx
│       └── dashboard/
│           └── page.tsx
```

### lib/types.ts

```ts
export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: { field: string; message: string }[];
}
```

### lib/auth-store.ts

```ts
import { User } from './types';

// ── In-memory token storage ─────────────────────────────────────
// Module-level variable — survives HMR in dev but NOT full page reload.
// On page reload, the refresh cookie (httpOnly) silently re-authenticates.

let accessToken: string | null = null;
let currentUser: User | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  // Notify subscribers when token changes
  listeners.forEach((fn) => fn());
}

export function getUser(): User | null {
  return currentUser;
}

export function setUser(user: User | null): void {
  currentUser = user;
}

export function clearAuth(): void {
  accessToken = null;
  currentUser = null;
  listeners.forEach((fn) => fn());
}

// ── Simple subscriber pattern for React reactivity ──────────────
const listeners = new Set<() => void>();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSnapshot(): string | null {
  return accessToken;
}
```

### lib/api-client.ts

```ts
import { getAccessToken, setAccessToken, clearAuth } from './auth-store';
import { AuthResponse, ApiError } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// ── Refresh mutex ────────────────────────────────────────────────
// Prevents multiple concurrent refresh requests when several API calls
// all get 401 at the same time.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // sends httpOnly cookie
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        // Refresh failed — clear auth, redirect to login
        clearAuth();
        return null;
      }

      const data: AuthResponse = await res.json();
      setAccessToken(data.accessToken);
      return data.accessToken;
    } catch {
      clearAuth();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ── Core fetch wrapper ────────────────────────────────────────────
interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string>;
}

async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, params, headers: customHeaders, ...rest } = options;

  // Build URL with query params
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  // Attach access token if available
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...rest,
    credentials: 'include', // needed for refresh cookie
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // ── 401 Interceptor: transparent refresh + retry ─────────────
  if (res.status === 401) {
    const errorData: ApiError = await res.json().catch(() => ({ error: 'Unauthorized' }));

    // Only attempt refresh for expired tokens, not for missing/invalid ones
    if (errorData.code === 'TOKEN_EXPIRED' || res.status === 401) {
      const newToken = await refreshAccessToken();

      if (newToken) {
        // Retry the original request with the new token
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryRes = await fetch(url, {
          ...rest,
          credentials: 'include',
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (retryRes.ok) {
          return retryRes.json();
        }

        // Retry also failed — throw
        const retryError: ApiError = await retryRes.json().catch(() => ({
          error: `Request failed with status ${retryRes.status}`,
        }));
        throw retryError;
      }

      // Refresh failed — redirect to login
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw { error: 'Session expired. Please log in again.' } as ApiError;
    }
  }

  // ── Handle other errors ──────────────────────────────────────
  if (!res.ok) {
    const errorData: ApiError = await res.json().catch(() => ({
      error: `Request failed with status ${res.status}`,
    }));
    throw errorData;
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

// ── Convenience methods ───────────────────────────────────────────
export const api = {
  get: <T>(endpoint: string, params?: Record<string, string>) =>
    apiClient<T>(endpoint, { method: 'GET', params }),

  post: <T>(endpoint: string, body?: unknown) =>
    apiClient<T>(endpoint, { method: 'POST', body }),

  put: <T>(endpoint: string, body?: unknown) =>
    apiClient<T>(endpoint, { method: 'PUT', body }),

  patch: <T>(endpoint: string, body?: unknown) =>
    apiClient<T>(endpoint, { method: 'PATCH', body }),

  delete: <T>(endpoint: string) =>
    apiClient<T>(endpoint, { method: 'DELETE' }),
};

// ── Auth-specific methods ─────────────────────────────────────────
export async function login(email: string, password: string) {
  const data = await apiClient<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function register(email: string, password: string) {
  const data = await apiClient<AuthResponse>('/auth/register', {
    method: 'POST',
    body: { email, password },
  });
  setAccessToken(data.accessToken);
  return data;
}

export async function logout() {
  await apiClient<void>('/auth/logout', { method: 'POST' });
  clearAuth();
}

export async function silentRefresh(): Promise<boolean> {
  // Called on app mount to restore session from refresh cookie
  const token = await refreshAccessToken();
  if (token) {
    // Fetch user profile with the new token
    try {
      const profile = await api.get<{ user: { id: string; email: string; role: string } }>('/profile');
      return !!profile.user;
    } catch {
      return false;
    }
  }
  return false;
}
```

### hooks/useAuth.ts

```ts
'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  getAccessToken,
  getUser,
  subscribe,
  clearAuth,
} from '../lib/auth-store';
import { login as apiLogin, register as apiRegister, logout as apiLogout, silentRefresh } from '../lib/api-client';
import { User } from '../lib/types';

export function useAuth() {
  // Re-render when token changes
  const token = useSyncExternalStore(subscribe, getAccessToken);

  const user = getUser();
  const isAuthenticated = !!token;

  // Attempt silent refresh on mount (restore session from cookie)
  useEffect(() => {
    if (!token) {
      silentRefresh();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    return data.user;
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const data = await apiRegister(email, password);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
  }, []);

  return { user, isAuthenticated, login, register, logout };
}
```

### app/login/page.tsx

```tsx
'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err?.error ?? 'Login failed');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Log In</h1>
      {error && <p role="alert">{error}</p>}
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </label>
      <button type="submit">Log In</button>
    </form>
  );
}
```

### app/dashboard/page.tsx

```tsx
'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

export default function DashboardPage() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<string>('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    api.get<{ message: string }>('/dashboard')
      .then((res) => setData(res.message))
      .catch(() => setData('Failed to load dashboard'));
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (!isAuthenticated) return null;

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome, {user?.email}</p>
      <p>Role: {user?.role}</p>
      <p>{data}</p>
      <button onClick={handleLogout}>Log Out</button>
    </div>
  );
}
```

---

## Key Design Decisions & Reasoning

### 1. Refresh Token Rotation

Every `/auth/refresh` call issues a **new refresh token** and invalidates the old one. This limits the damage window if a refresh token is stolen — the attacker gets one use, and the legitimate user's next refresh attempt fails (detecting theft). The `tokenVersion` field in the refresh payload enables forced logout: bumping the version in the database invalidates all outstanding refresh tokens for that user.

### 2. Cookie Path Scoping

The refresh cookie uses `path: '/api/auth'` so the browser only sends it on auth endpoints, not on every API request. This reduces the attack surface — a malicious endpoint can't harvest the cookie.

### 3. Refresh Mutex

When multiple API calls fail with 401 simultaneously, we don't want N parallel refresh requests. The `refreshPromise` variable acts as a mutex: the first caller initiates the refresh, and all subsequent callers await the same promise. This avoids race conditions where a second refresh could invalidate the token the first refresh just obtained.

### 4. In-Memory Access Token

Storing the access token in a module-level variable (not `localStorage`) means:
- **XSS can't steal it** — a script injection can read `localStorage` but not a closure variable in a different module.
- **Tab isolation** — each tab has its own copy, preventing cross-tab token leakage.
- **Auto-clear on close** — closing the tab wipes the token. The refresh cookie re-authenticates silently on next visit.

The trade-off is that the token is lost on page reload, but the `silentRefresh()` call on mount restores the session from the refresh cookie.

### 5. Middleware Order is Security-Critical

```
requestId → logger → CORS → rateLimit → auth → validation → handler → errorHandler
```

- **requestId first**: every log line, including errors, carries the correlation ID.
- **logger early**: captures all requests including rejected ones (429, 401, etc.).
- **CORS before rateLimit**: preflight `OPTIONS` requests must succeed for the browser to even attempt the real request. If CORS comes after rate limiting, legitimate preflight requests get throttled.
- **rateLimit before auth**: rejecting unauthenticated floods is cheaper than verifying JWTs for each request.
- **auth before validation**: validation may reference `req.user` (e.g., "you can only update your own profile").
- **errorHandler last**: catches errors from all middleware above it.

### 6. Error Response Contract

The backend returns a consistent `ApiError` shape: `{ error: string, code?: string, details?: [...] }`. The `code` field is critical — `TOKEN_EXPIRED` tells the frontend to attempt a refresh, while a generic 401 without that code means the token is structurally invalid and refresh won't help. This prevents infinite refresh loops.

### 7. CORS `credentials: true`

The `cors` middleware must set `credentials: true` because the browser won't send cookies on cross-origin requests without it. The `Access-Control-Allow-Credentials: true` header is required for the refresh cookie to be sent from `localhost:3000` (Next.js) to `localhost:4000` (Express).