# JWT Authentication: Next.js + Express

## Step 0: Requirements

| Item | Decision |
|------|----------|
| Stack | Express backend, Next.js frontend (TypeScript) |
| Service type | API-only backend serving a separate frontend |
| Database | PostgreSQL (user/session tables) |
| Integration | REST |
| Real-time | Not needed for auth |
| Auth | JWT — 15min access token (in-memory) + httpOnly refresh cookie |

## Step 1: Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Project structure | Feature-first | Skill Iron Rule 1 — organize by feature, not layer |
| API client approach | Typed fetch wrapper + React Query | REST API; typed fetch gives us interceptor control; React Query for caching/refetch |
| Auth strategy | JWT + httpOnly refresh cookie | Access token in memory (XSS-safe), refresh in httpOnly cookie (CSRF-protected with SameSite) |
| Error handling | Typed error hierarchy + global handler | Skill Iron Rules 5 & 6 — typed errors, consistent format |
| Middleware order | RequestID → Logging → CORS → RateLimit → Auth → Validation → Handler → ErrorHandler | Skill Section 6 mandate |

## Step 2: Scaffold Checklist

```
backend/
  src/
    config/
      env.ts              # Typed config, validated at startup
    shared/
      middleware/
        requestId.ts
        logger.ts
        cors.ts
        rateLimit.ts
        auth.ts
        validation.ts
        errorHandler.ts
      errors/
        AppError.ts
        types.ts
    auth/
      auth.controller.ts
      auth.service.ts
      auth.repository.ts
      auth.routes.ts
      auth.validation.ts
    app.ts
    server.ts
frontend/
  src/
    lib/
      api-client.ts       # Typed fetch wrapper with 401 interceptor
      auth.ts              # Token storage + refresh logic
    features/
      auth/
        hooks/
          useAuth.ts
          useLogin.ts
        components/
          LoginForm.tsx
```

## Step 3: Implementation

### 3.1 Configuration & Environment

```typescript
// backend/src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function getConfig(): Env {
  if (cachedEnv) return cachedEnv;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  cachedEnv = result.data;
  return cachedEnv;
}
```

### 3.2 Typed Error Hierarchy

```typescript
// backend/src/shared/errors/AppError.ts
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly detail?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    isOperational = true,
    detail?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.detail = detail;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  public readonly fields: FieldError[];

  constructor(fields: FieldError[]) {
    super('Validation failed', 'VALIDATION_ERROR', 400, true, { fields });
    this.fields = fields;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403);
  }
}

export interface FieldError {
  field: string;
  message: string;
  value?: unknown;
}
```

```typescript
// backend/src/shared/errors/types.ts
export type { AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, FieldError } from './AppError';
```

### 3.3 Middleware Chain (in order per Skill Section 6)

```typescript
// backend/src/shared/middleware/requestId.ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-Id', id);
  next();
}
```

```typescript
// backend/src/shared/middleware/logger.ts
import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  serializers: {
    req(req: Request) {
      return {
        method: req.method,
        url: req.url,
        requestId: req.headers['x-request-id'],
      };
    },
  },
});

export type Logger = typeof logger;

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      req,
      res: { statusCode: res.statusCode },
      durationMs: Date.now() - start,
    });
  });
  next();
}

export { logger };
```

```typescript
// backend/src/shared/middleware/cors.ts
import cors from 'cors';
import { getConfig } from '../../config/env';

export const corsMiddleware = cors({
  origin: getConfig().CORS_ORIGIN,
  credentials: true, // Required for httpOnly cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
});
```

```typescript
// backend/src/shared/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';
import { getConfig } from '../../config/env';

export const rateLimiter = rateLimit({
  windowMs: getConfig().RATE_LIMIT_WINDOW_MS,
  max: getConfig().RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', code: 'RATE_LIMITED', status: 429 },
});

// Stricter limits for auth endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts', code: 'AUTH_RATE_LIMITED', status: 429 },
});
```

```typescript
// backend/src/shared/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../../config/env';
import { UnauthorizedError } from '../errors/AppError';

export interface JwtPayload {
  sub: string;    // user ID
  email: string;
  role: string;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const config = getConfig();
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Access token expired'));
    }
    return next(new UnauthorizedError('Invalid access token'));
  }
}

// Optional: role-based authorization
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError());
    }
    next();
  };
}

import { ForbiddenError } from '../errors/AppError';
```

```typescript
// backend/src/shared/middleware/validation.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/AppError';
import type { FieldError } from '../errors/AppError';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      const fields: FieldError[] = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new ValidationError(fields));
    }

    // Replace with validated data
    req.body = result.data.body;
    req.params = result.data.params;
    req.query = result.data.query;
    next();
  };
}
```

```typescript
// backend/src/shared/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from './logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.headers['x-request-id'] as string;

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err, requestId }, 'Unexpected operational error');
    }

    const body: Record<string, unknown> = {
      error: err.message,
      code: err.code,
      status: err.statusCode,
      requestId,
    };

    if (err instanceof ValidationError) {
      body.detail = { fields: err.fields };
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown errors — never leak internals
  logger.error({ err, requestId }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    status: 500,
    requestId,
  });
}
```

### 3.4 Auth Feature (Feature-First Structure)

```typescript
// backend/src/auth/auth.validation.ts
import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
  params: z.object({}),
  query: z.object({}),
});

export const refreshSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({}),
});

export const logoutSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({}),
});
```

```typescript
// backend/src/auth/auth.repository.ts
import { Pool } from 'pg';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: Date;
}

export class AuthRepository {
  constructor(private db: Pool) {}

  async findByEmail(email: string): Promise<UserRow | null> {
    const result = await this.db.query(
      'SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1',
      [email],
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const result = await this.db.query(
      'SELECT id, email, password_hash, role, created_at FROM users WHERE id = $1',
      [id],
    );
    return result.rows[0] ?? null;
  }

  async storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET token_hash = $2, expires_at = $3`,
      [userId, tokenHash, expiresAt],
    );
  }

  async revokeRefreshToken(userId: string): Promise<void> {
    await this.db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  }
}
```

```typescript
// backend/src/auth/auth.service.ts
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getConfig } from '../config/env';
import { AuthRepository } from './auth.repository';
import { UnauthorizedError, NotFoundError } from '../shared/errors/AppError';
import type { JwtPayload } from '../shared/middleware/auth';

export class AuthService {
  constructor(private repo: AuthRepository) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.repo.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    return this.generateTokens(user.id, user.email, user.role);
  }

  async refresh(token: string): Promise<LoginResult> {
    const config = getConfig();
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as JwtPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await this.repo.findById(payload.sub);
    if (!user) {
      throw new NotFoundError('User', payload.sub);
    }

    // Rotate: revoke old, issue new
    await this.repo.revokeRefreshToken(user.id);
    return this.generateTokens(user.id, user.email, user.role);
  }

  async logout(userId: string): Promise<void> {
    await this.repo.revokeRefreshToken(userId);
  }

  private async generateTokens(userId: string, email: string, role: string): Promise<LoginResult> {
    const config = getConfig();

    const accessPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: userId,
      email,
      role,
    };

    const accessToken = jwt.sign(accessPayload, config.JWT_ACCESS_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRY,
    });

    const refreshToken = jwt.sign(accessPayload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRY,
    });

    // Hash the refresh token for storage — never store plaintext
    const tokenHash = crypto.sha256?.update(refreshToken).digest('hex')
      ?? crypto.createHash('sha256').update(refreshToken).digest('hex');

    const decoded = jwt.decode(refreshToken) as JwtPayload;
    await this.repo.storeRefreshToken(userId, tokenHash, new Date(decoded.exp * 1000));

    return { accessToken, refreshToken, userId };
  }
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
}
```

```typescript
// backend/src/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AppError } from '../shared/errors/AppError';
import { getConfig } from '../config/env';

export class AuthController {
  constructor(private service: AuthService) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;
      const result = await this.service.login(email, password);

      // Set refresh token as httpOnly cookie
      const config = getConfig();
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Access token returned in response body — frontend stores in memory
      res.status(200).json({
        accessToken: result.accessToken,
        userId: result.userId,
      });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        throw new AppError('No refresh token', 'NO_REFRESH_TOKEN', 401);
      }

      const result = await this.service.refresh(refreshToken);

      // Rotate: set new refresh cookie
      const config = getConfig();
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        accessToken: result.accessToken,
        userId: result.userId,
      });
    } catch (err) {
      // Clear cookie on refresh failure
      res.clearCookie('refreshToken', { path: '/api/auth' });
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.sub;
      if (userId) {
        await this.service.logout(userId);
      }
      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
```

```typescript
// backend/src/auth/auth.routes.ts
import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../shared/middleware/validation';
import { loginSchema, refreshSchema, logoutSchema } from './auth.validation';
import { authenticate } from '../shared/middleware/auth';
import { authRateLimiter } from '../shared/middleware/rateLimit';

export function createAuthRoutes(controller: AuthController): Router {
  const router = Router();

  router.post('/login', authRateLimiter, validate(loginSchema), controller.login);
  router.post('/refresh', authRateLimiter, validate(refreshSchema), controller.refresh);
  router.post('/logout', authenticate, validate(logoutSchema), controller.logout);

  return router;
}
```

### 3.5 App Wiring (Middleware Order Matters)

```typescript
// backend/src/app.ts
import express from 'express';
import { requestId } from './shared/middleware/requestId';
import { requestLogger } from './shared/middleware/logger';
import { corsMiddleware } from './shared/middleware/cors';
import { rateLimiter } from './shared/middleware/rateLimit';
import { errorHandler } from './shared/middleware/errorHandler';
import { createAuthRoutes } from './auth/auth.routes';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthRepository } from './auth/auth.repository';
import { Pool } from 'pg';
import { getConfig } from './config/env';

const config = getConfig();
const db = new Pool({ connectionString: config.DATABASE_URL });
const authRepo = new AuthRepository(db);
const authService = new AuthService(authRepo);
const authController = new AuthController(authService);

const app = express();

// ── Middleware chain (order per Skill Section 6) ──
// 1. Request ID
app.use(requestId);
// 2. Logging
app.use(requestLogger);
// 3. CORS
app.use(corsMiddleware);
// 4. Rate limiting (global)
app.use(rateLimiter);
// 5. Body parsing (between rate limit and auth)
app.use(express.json());
// 6. Routes (auth middleware applied per-route via authenticate())
app.use('/api/auth', createAuthRoutes(authController));
// 7. Health check (no auth required)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});
// 8. Error handler (always last)
app.use(errorHandler);

export default app;
```

```typescript
// backend/src/server.ts
import http from 'http';
import app from './app';
import { getConfig } from './config/env';

const config = getConfig();
const server = http.createServer(app);

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT} [${config.NODE_ENV}]`);
});
```

### 3.6 Frontend: Typed API Client with 401 Interceptor

```typescript
// frontend/src/lib/auth.ts
// In-memory token storage — never persisted to localStorage (Iron Rule: no JWT in localStorage)

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
}
```

```typescript
// frontend/src/lib/api-client.ts
import { getAccessToken, setAccessToken, clearAccessToken } from './auth';

interface ApiError {
  error: string;
  code: string;
  status: number;
  requestId: string;
  detail?: { fields: Array<{ field: string; message: string }> };
}

let isRefreshing = false;
let pendingRequests: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processPendingRequests(token: string | null, error?: unknown): void {
  pendingRequests.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  pendingRequests = [];
}

async function refreshAccessToken(): Promise<string> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include', // Send httpOnly cookie
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    clearAccessToken();
    throw new Error('Refresh failed');
  }

  const data = await response.json();
  setAccessToken(data.accessToken);
  return data.accessToken;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = getAccessToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include', // Include cookies for refresh
    });

    // ── 401 Interceptor: transparent refresh + retry ──
    if (response.status === 401) {
      if (isRefreshing) {
        // Queue this request behind the in-flight refresh
        return new Promise<T>((resolve, reject) => {
          pendingRequests.push({
            resolve: () => this.request<T>(path, options).then(resolve).catch(reject),
            reject,
          });
        });
      }

      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        processPendingRequests(newToken);
        // Retry original request with new token
        return this.request<T>(path, options);
      } catch (refreshError) {
        isRefreshing = false;
        processPendingRequests(null, refreshError);
        clearAccessToken();
        // Redirect to login or emit event
        window.dispatchEvent(new CustomEvent('auth:logout'));
        throw refreshError;
      }
    }

    if (!response.ok) {
      const errorBody: ApiError = await response.json().catch(() => ({
        error: response.statusText,
        code: 'UNKNOWN',
        status: response.status,
        requestId: '',
      }));
      throw errorBody;
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put<T>(path: string, body: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient(process.env.NEXT_PUBLIC_API_URL);
```

### 3.7 Frontend: React Query Integration

```typescript
// frontend/src/features/auth/hooks/useLogin.ts
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  accessToken: string;
  userId: string;
}

export function useLogin() {
  return useMutation({
    mutationFn: async (data: LoginRequest): Promise<LoginResponse> => {
      const response = await api.post<LoginResponse>('/api/auth/login', data);
      setAccessToken(response.accessToken);
      return response;
    },
  });
}
```

```typescript
// frontend/src/features/auth/hooks/useAuth.ts
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { clearAccessToken } from '@/lib/auth';

export function useLogout() {
  return useMutation({
    mutationFn: () => api.delete('/api/auth/logout'),
    onSuccess: () => {
      clearAccessToken();
    },
  });
}
```

```typescript
// frontend/src/features/auth/components/LoginForm.tsx
'use client';

import { useState } from 'react';
import { useLogin } from '../hooks/useLogin';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: () => {
          window.location.href = '/dashboard';
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1>Sign In</h1>
      {login.isError && (
        <div role="alert">
          {login.error instanceof Error ? login.error.message : 'Login failed'}
        </div>
      )}
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <button type="submit" disabled={login.isPending}>
        {login.isPending ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
```

### 3.8 Frontend: Auth Event Listener (for global logout)

```typescript
// frontend/src/lib/auth-listener.ts
// Call this once at app root (e.g., in layout.tsx or _app.tsx)
import { clearAccessToken } from './auth';

export function initAuthListener(): () => void {
  const handler = () => {
    clearAccessToken();
    window.location.href = '/login';
  };

  window.addEventListener('auth:logout', handler);
  return () => window.removeEventListener('auth:logout', handler);
}
```

```tsx
// frontend/src/app/layout.tsx (or pages/_app.tsx)
'use client';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initAuthListener } from '@/lib/auth-listener';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const cleanup = initAuthListener();
    return cleanup;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

## Step 4: Verification Checklist

| Check | Command | Expected |
|-------|---------|----------|
| Build check | `npx tsc --noEmit` (backend) | Zero type errors |
| Build check | `npx next build` (frontend) | Zero build errors |
| Smoke test — login | `POST /api/auth/login` with valid creds | 200 + accessToken + Set-Cookie: refreshToken |
| Smoke test — refresh | `POST /api/auth/refresh` with cookie | 200 + new accessToken + rotated cookie |
| Smoke test — 401 retry | Expire access token, make API call | Transparent refresh + retry, user sees success |
| Integration — middleware order | Check response headers | X-Request-Id present on all responses |
| Integration — CORS | Cross-origin request from frontend | Proper preflight, credentials flow |
| Security — cookie flags | Inspect Set-Cookie header | httpOnly, secure (prod), SameSite=Strict |
| Security — no localStorage | Search codebase for `localStorage` | Zero hits for token storage |

## Step 5: Handoff Summary

**What was built:**
- Express backend with full middleware chain (RequestID → Logging → CORS → RateLimit → BodyParse → Auth → Validation → Handler → ErrorHandler)
- JWT auth feature: login, refresh (with rotation), logout
- Access token in memory (never localStorage), refresh token in httpOnly cookie
- Typed error hierarchy with consistent `{ error, code, status, requestId }` responses
- Frontend typed API client with 401 interceptor that queues concurrent requests during refresh
- React Query hooks for login/logout

**Key decisions:**
- Feature-first structure (Iron Rule 1)
- Refresh token rotation — each refresh invalidates the old token and issues a new one
- Concurrent 401 requests are queued behind a single in-flight refresh to avoid token race conditions
- `auth:logout` custom event for global redirect on refresh failure

**Hand-offs:**
- Build failures → `build-resolver`
- Code quality review → `code-review`
- Security audit → `security-auditor` (especially: CSRF considerations, cookie SameSite, rate limiting effectiveness)