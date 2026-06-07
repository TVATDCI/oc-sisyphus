Task Result

Task ID: bg_5235328f
Description: Run eval 9 with-skill
Duration: 2m 25s
Session ID: ses_15c562ec8ffeuZWpq9iFO14rNl

---

The user wants a comprehensive full-stack architecture for a cross-platform mobile app with Swift iOS, Kotlin Android, and Go backend. Let me follow the fullstack-dev skill workflow:

Step 0: Gather Requirements - already provided
Step 1: Make Architectural Decisions
Step 2: Scaffold with Checklist
Step 3: Implement Following Patterns
Step 4: Verify
Step 5: Handoff Summary

Let me work through this systematically.

Requirements:
- Stack: Swift iOS, Kotlin Android, Go backend
- Service type: Full-stack with gRPC inter-service + REST for mobile
- Database: Deciding between CockroachDB and DynamoDB
- Integration: REST for mobile clients, gRPC for inter-service
- Real-time: Push notifications (APNs/FCM)
- Auth: OAuth2 with Google and Apple Sign-In
- Special: Offline sync with CRDT conflict resolution

This project uses Go, Swift, and Kotlin. No language-specific rules exist in this system for Go, Swift, or Kotlin. I need to state that explicitly per the Capability Boundary protocol.

Let me build out the full architecture.

I read this as a greenfield cross-platform mobile + Go backend architecture request with gRPC inter-service, REST mobile API, OAuth2 auth, and CRDT offline sync — need to make all architectural decisions, show project structure for all three platforms, and detail auth + sync flows end-to-end.

---

## Step 0: Requirements Summary

| Dimension | Decision |
|-----------|----------|
| Stack | Go backend, Swift iOS, Kotlin Android |
| Service type | API backend with gRPC inter-service mesh |
| Database | CockroachDB (SQL, distributed) — see rationale below |
| Integration | REST for mobile clients, gRPC for inter-service |
| Real-time | Push notifications (APNs + FCM) |
| Auth | OAuth2 via Google + Apple Sign-In |
| Offline | CRDT-based sync with conflict-free resolution |

## Step 1: Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Project structure | Feature-first | Core Principle #1 — organize by domain, not layer |
| API client approach | Typed REST client per platform (URLSession / Retrofit) | Mobile clients can't share tRPC; OpenAPI codegen for Go→Go gRPC |
| Auth strategy | OAuth2 + JWT access + refresh tokens, httpOnly cookie for refresh | Mobile needs stateless JWT; refresh in secure storage (Keychain / EncryptedSharedPreferences) |
| Middleware order | RequestID → Logging → CORS → RateLimit → BodyParse → Auth → Authz → Validation → Handler → ErrorHandler | Standard chain from Section 6 |
| Real-time method | Push notifications (APNs/FCM) for alerts; REST polling for sync | Push is one-way; sync uses explicit REST endpoints, not SSE/WS |
| Error handling | Typed error hierarchy in Go + global error handler | Core Principle #5 — even Go gets typed errors |
| Database | **CockroachDB** over DynamoDB | CRDT conflict resolution needs transactional reads + writes across multiple entities; CockroachDB gives distributed SQL with serializable isolation, making sync metadata management far simpler than DynamoDB's eventual consistency model |

> **This project uses Go, Swift, and Kotlin. No language-specific rules exist in this system for these languages.** I apply the fullstack-dev architecture patterns and reference external conventions: [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments), [Effective Go](https://go.dev/doc/effective_go), [Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/), and [Kotlin Coding Conventions](https://kotlinlang.org/docs/coding-conventions.html).

---

## Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOBILE CLIENTS                           │
│  ┌──────────────────┐              ┌──────────────────┐        │
│  │   Swift / iOS     │              │  Kotlin / Android │       │
│  │  ┌──────────────┐│              │  ┌──────────────┐ │        │
│  │  │ Local SQLite  ││              │  │ Local Room DB │ │        │
│  │  │ + CRDT Engine ││              │  │ + CRDT Engine │ │        │
│  │  └──────┬───────┘│              │  └──────┬───────┘ │        │
│  │         │        │              │         │         │        │
│  │  ┌──────┴───────┐│              │  ┌──────┴───────┐ │        │
│  │  │ Sync Manager ││              │  │ Sync Manager │ │        │
│  │  │ (offline-first)│              │  │ (offline-first)│        │
│  │  └──────┬───────┘│              │  └──────┬───────┘ │        │
│  └─────────┼────────┘              └─────────┼─────────┘        │
│            │ REST + JWT                       │ REST + JWT       │
└────────────┼──────────────────────────────────┼─────────────────┘
             │                                  │
             ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                        GO BACKEND                               │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   API Gateway (REST)                       │  │
│  │  RequestID → Logging → RateLimit → Auth → Validation      │  │
│  └──────┬──────────┬──────────┬──────────┬───────────────────┘  │
│         │          │          │          │                      │
│    ┌────▼───┐ ┌────▼───┐ ┌───▼────┐ ┌───▼────┐               │
│    │ Auth   │ │ Sync   │ │ Push   │ │ Entity │  ...features   │
│    │Service │ │Service │ │Service │ │Services│               │
│    └────┬───┘ └────┬───┘ └───┬────┘ └───┬────┘               │
│         │gRPC      │gRPC     │gRPC      │gRPC                  │
│    ┌────▼──────────▼─────────▼──────────▼────┐                │
│    │           gRPC Service Mesh              │                │
│    └────────────────────┬────────────────────┘                │
│                         │                                       │
│              ┌──────────▼──────────┐                           │
│              │    CockroachDB       │                           │
│              │  (distributed SQL)   │                           │
│              └─────────────────────┘                            │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Redis       │  │   APNs/FCM   │  │  Job Queue   │        │
│  │  (cache/sess) │  │  (push notif) │  │  (async work) │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure — All Three Platforms

### Go Backend (Feature-First)

```
backend/
├── cmd/
│   ├── api/                    # REST API gateway entrypoint
│   │   └── main.go
│   ├── sync/                   # Sync service entrypoint
│   │   └── main.go
│   └── worker/                 # Background job worker entrypoint
│       └── main.go
├── internal/
│   ├── config/
│   │   └── config.go           # Centralized typed config, fail-fast
│   ├── middleware/
│   │   ├── request_id.go
│   │   ├── logging.go
│   │   ├── cors.go
│   │   ├── rate_limit.go
│   │   ├── auth.go
│   │   ├── authorization.go
│   │   └── error_handler.go    # Global error handler
│   ├── errors/
│   │   └── errors.go           # Typed error hierarchy
│   ├── auth/
│   │   ├── auth.controller.go
│   │   ├── auth.service.go
│   │   ├── auth.repository.go
│   │   ├── auth.dto.go
│   │   ├── google_provider.go   # Google OAuth2 flow
│   │   ├── apple_provider.go   # Apple Sign-In flow
│   │   ├── jwt.go               # JWT issue/verify
│   │   └── auth.test.go
│   ├── sync/
│   │   ├── sync.controller.go
│   │   ├── sync.service.go
│   │   ├── sync.repository.go
│   │   ├── crdt.go              # CRDT merge engine
│   │   ├── vector_clock.go      # Causal ordering
│   │   ├── conflict_resolver.go
│   │   ├── sync.dto.go
│   │   └── sync.test.go
│   ├── push/
│   │   ├── push.controller.go
│   │   ├── push.service.go
│   │   ├── apns_provider.go
│   │   ├── fcm_provider.go
│   │   ├── push.dto.go
│   │   └── push.test.go
│   ├── users/
│   │   ├── users.controller.go
│   │   ├── users.service.go
│   │   ├── users.repository.go
│   │   ├── users.dto.go
│   │   └── users.test.go
│   └── shared/
│       ├── database/
│       │   ├── cockroach.go     # Connection pool, migrations
│       │   └── migrations/
│       ├── redis/
│       │   └── client.go
│       ├── logger/
│       │   └── logger.go        # Structured JSON logging
│       └── health/
│           └── health.go
├── proto/
│   ├── auth.proto
│   ├── sync.proto
│   └── push.proto
├── api/
│   └── openapi.yaml             # REST API spec for mobile clients
├── migrations/
│   ├── 001_create_users.up.sql
│   ├── 001_create_users.down.sql
│   ├── 002_create_sync_log.up.sql
│   └── 002_create_sync_log.down.sql
├── .env.example
├── go.mod
├── go.sum
├── Makefile
└── Dockerfile
```

### Swift iOS Client (Feature-First)

```
ios/
├── App/
│   ├── AppDelegate.swift
│   ├── SceneDelegate.swift
│   └── AppConfig.swift           # Centralized config from env
├── Features/
│   ├── Auth/
│   │   ├── AuthViewController.swift
│   │   ├── AuthViewModel.swift
│   │   ├── GoogleSignInProvider.swift
│   │   ├── AppleSignInProvider.swift
│   │   └── KeychainTokenStore.swift
│   ├── Sync/
│   │   ├── SyncManager.swift
│   │   ├── CRDTMergeEngine.swift
│   │   ├── VectorClock.swift
│   │   ├── OfflineStore.swift
│   │   └── SyncStatusView.swift
│   ├── Push/
│   │   ├── PushNotificationHandler.swift
│   │   └── PushSettingsViewController.swift
│   └── Home/
│       ├── HomeViewController.swift
│       └── HomeViewModel.swift
├── Networking/
│   ├── APIClient.swift            # Typed REST client
│   ├── APIError.swift             # Error hierarchy
│   ├── RequestInterceptor.swift   # Auto JWT attach + refresh
│   └── Endpoints.swift
├── Storage/
│   ├── CoreDataStack.swift        # Local SQLite via Core Data
│   └── CRDTModels.xcdatamodeld
├── Extensions/
│   └── ...
├── Resources/
│   ├── Assets.xcassets
│   └── Info.plist
├── Tests/
│   ├── CRDTMergeTests.swift
│   ├── SyncManagerTests.swift
│   └── AuthFlowTests.swift
└── Podfile / Package.swift
```

### Kotlin Android Client (Feature-First)

```
android/
├── app/
│   ├── src/main/
│   │   ├── java/com/app/
│   │   │   ├── App.kt
│   │   │   ├── di/                        # Dependency injection
│   │   │   │   ├── NetworkModule.kt
│   │   │   │   ├── DatabaseModule.kt
│   │   │   │   └── AuthModule.kt
│   │   │   ├── config/
│   │   │   │   └── AppConfig.kt            # Centralized config
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── AuthViewModel.kt
│   │   │   │   │   ├── AuthActivity.kt
│   │   │   │   │   ├── GoogleSignInProvider.kt
│   │   │   │   │   ├── AppleSignInProvider.kt
│   │   │   │   │   └── TokenStore.kt       # EncryptedSharedPreferences
│   │   │   │   ├── sync/
│   │   │   │   │   ├── SyncManager.kt
│   │   │   │   │   ├── CRDTMergeEngine.kt
│   │   │   │   │   ├── VectorClock.kt
│   │   │   │   │   └── SyncWorker.kt       # WorkManager for bg sync
│   │   │   │   ├── push/
│   │   │   │   │   ├── PushNotificationHandler.kt
│   │   │   │   │   └── FirebaseMessagingService.kt
│   │   │   │   └── home/
│   │   │   │       ├── HomeViewModel.kt
│   │   │   │       └── HomeFragment.kt
│   │   │   ├── network/
│   │   │   │   ├── ApiClient.kt            # Retrofit + OkHttp
│   │   │   │   ├── ApiError.kt              # Typed error hierarchy
│   │   │   │   ├── AuthInterceptor.kt       # Auto JWT + refresh
│   │   │   │   └── ApiEndpoints.kt
│   │   │   ├── storage/
│   │   │   │   ├── AppDatabase.kt           # Room
│   │   │   │   ├── dao/
│   │   │   │   └── entity/
│   │   │   └── util/
│   │   │       └── ErrorMessageMapper.kt    # API error → user message
│   │   ├── res/
│   │   └── AndroidManifest.xml
│   └── src/test/
│       ├── CRDTMergeTest.kt
│       ├── SyncManagerTest.kt
│       └── AuthFlowTest.kt
├── build.gradle.kts
└── proguard-rules.pro
```

---

## Auth Flow — End-to-End

### Architecture: OAuth2 + JWT Access + Refresh Tokens

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│  iOS App │         │ Android  │         │Go Backend│
│          │         │   App    │         │          │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                     │                    │
     │  1. User taps       │                    │
     │  "Sign in with      │                    │
     │  Google/Apple"      │                    │
     │                     │                    │
     ▼                     ▼                    │
┌─────────────────────────────────┐             │
│  OS-native Sign-In flow         │             │
│  (ASAuthorizationAppleIDProvider │             │
│   / Google Sign-In SDK)         │             │
│                                 │             │
│  Returns: identityToken/JWT     │             │
│  from Apple/Google              │             │
└──────────────┬──────────────────┘             │
               │                                │
               │ 2. Send provider token         │
               │    to backend                  │
               │────────────────────────────────▶│
               │  POST /api/auth/{provider}      │
               │  { identityToken: "..." }       │
               │                                │
               │                    ┌────────────▼────────────┐
               │                    │ 3. Backend verifies      │
               │                    │    token with provider   │
               │                    │                          │
               │                    │  Google: call Google's   │
               │                    │    tokeninfo endpoint    │
               │                    │  Apple: verify JWT with  │
               │                    │    Apple's public keys   │
               │                    │                          │
               │                    │ 4. Find or create user   │
               │                    │    in CockroachDB        │
               │                    │                          │
               │                    │ 5. Issue tokens:          │
               │                    │    access:  JWT (15min)  │
               │                    │    refresh: JWT (7d)     │
               │                    │                          │
               │                    │ 6. Store refresh token   │
               │                    │    hash in DB + Redis    │
               │                    └────────────┬─────────────┘
               │                                 │
               │  7. Response                     │
               │◀────────────────────────────────│
               │  { accessToken, expiresIn: 900, │
               │    user: { id, email, name } }  │
               │                                 │
               │  Set-Cookie: refresh_token      │
               │  (httpOnly, Secure, SameSite=    │
               │   Strict; NOT accessible to JS)  │
               │                                 │
               ▼                                 │
┌──────────────────────────┐                    │
│ 8. Client stores:        │                    │
│   iOS: Keychain          │                    │
│   Android: EncryptedSP   │                    │
│                          │                    │
│ 9. Every API request:    │                    │
│   Authorization: Bearer  │                    │
│   <accessToken>          │                    │
└──────────────────────────┘                    │
                                               │
               ┌───────────────────────────────┘
               │
               │ 10. Token refresh flow
               │    (when access token expires)
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│  Client detects 401 → calls POST /api/auth/refresh       │
│  (sends refresh cookie automatically via credentials:    │
│   'include' on iOS, same credential policy on Android)  │
│                                                          │
│  Backend:                                                │
│    a. Verify refresh token signature + expiry            │
│    b. Check token hash exists in DB (not revoked)        │
│    c. Rotate: invalidate old refresh, issue new pair     │
│    d. Return new access token + set new refresh cookie   │
│                                                          │
│  Client:                                                 │
│    a. Store new access token                              │
│    b. Retry original request with new access token        │
│    c. If refresh also fails → redirect to login           │
└──────────────────────────────────────────────────────────┘
```

### Go Auth Implementation

```go
// internal/errors/errors.go — Typed error hierarchy
package errors

import "net/http"

type AppError struct {
    Message    string `json:"message"`
    Code       string `json:"code"`
    StatusCode int    `json:"status"`
    Operational bool  `json:"-"`
}

func (e *AppError) Error() string { return e.Message }

var (
    ErrUnauthorized = &AppError{Code: "UNAUTHORIZED", StatusCode: http.StatusUnauthorized, Message: "Authentication required"}
    ErrForbidden    = &AppError{Code: "FORBIDDEN", StatusCode: http.StatusForbidden, Message: "Insufficient permissions"}
    ErrNotFound     = &AppError{Code: "NOT_FOUND", StatusCode: http.StatusNotFound, Message: "Resource not found"}
    ErrValidation   = &AppError{Code: "VALIDATION_ERROR", StatusCode: http.StatusUnprocessableEntity, Message: "Validation failed"}
    ErrConflict     = &AppError{Code: "CONFLICT", StatusCode: http.StatusConflict, Message: "Resource conflict"}
)

func NewNotFound(resource, id string) *AppError {
    return &AppError{Code: "NOT_FOUND", StatusCode: 404, Message: resource + " not found: " + id}
}

func NewValidation(fieldErrors []FieldError) *AppError {
    return &AppError{Code: "VALIDATION_ERROR", StatusCode: 422, Message: "Validation failed"}
}
```

```go
// internal/auth/auth.service.go
package auth

import (
    "context"
    "crypto/ed25519"
    "time"

    "github.com/golang-jwt/jwt/v5"
)

type AuthService struct {
    repo          AuthRepository
    googleProvider *GoogleOAuthProvider
    appleProvider  *AppleSignInProvider
    jwtSecret     ed25519.PrivateKey
    refreshSecret []byte
    redis         RedisClient
}

type AuthResult struct {
    AccessToken  string    `json:"accessToken"`
    ExpiresIn    int       `json:"expiresIn"`
    User         UserDTO   `json:"user"`
}

// SignInWithProvider handles Google and Apple OAuth2 flows
func (s *AuthService) SignInWithProvider(ctx context.Context, provider, idToken string) (*AuthResult, error) {
    // Step 3: Verify token with provider
    var userInfo *ProviderUserInfo
    var err error
    switch provider {
    case "google":
        userInfo, err = s.googleProvider.VerifyToken(ctx, idToken)
    case "apple":
        userInfo, err = s.appleProvider.VerifyToken(ctx, idToken)
    default:
        return nil, apperrors.ErrValidation
    }
    if err != nil {
        return nil, apperrors.ErrUnauthorized
    }

    // Step 4: Find or create user
    user, err := s.repo.FindOrCreateByProvider(ctx, provider, userInfo)
    if err != nil {
        return nil, err
    }

    // Step 5: Issue tokens
    accessToken, err := s.issueAccessToken(user)
    if err != nil {
        return nil, err
    }

    refreshToken, err := s.issueRefreshToken(user)
    if err != nil {
        return nil, err
    }

    // Step 6: Store refresh token hash
    if err := s.repo.StoreRefreshToken(ctx, user.ID, refreshToken); err != nil {
        return nil, err
    }

    return &AuthResult{
        AccessToken: accessToken,
        ExpiresIn:   900, // 15 minutes
        User:         toDTO(user),
    }, nil
}

func (s *AuthService) issueAccessToken(user User) (string, error) {
    claims := jwt.MapClaims{
        "sub":   user.ID,
        "roles": user.Roles,
        "exp":   time.Now().Add(15 * time.Minute).Unix(),
        "iat":   time.Now().Unix(),
    }
    token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
    return token.SignedString(s.jwtSecret)
}

func (s *AuthService) RefreshToken(ctx context.Context, oldRefresh string) (*AuthResult, error) {
    // Verify signature + expiry
    claims, err := s.verifyRefreshToken(oldRefresh)
    if err != nil {
        return nil, apperrors.ErrUnauthorized
    }

    userID := claims["sub"].(string)

    // Check not revoked in DB
    valid, err := s.repo.IsRefreshTokenValid(ctx, userID, oldRefresh)
    if !valid || err != nil {
        return nil, apperrors.ErrUnauthorized
    }

    // Rotate: invalidate old, issue new pair
    if err := s.repo.RevokeRefreshToken(ctx, userID, oldRefresh); err != nil {
        return nil, err
    }

    user, err := s.repo.FindByID(ctx, userID)
    if err != nil {
        return nil, err
    }

    newAccess, _ := s.issueAccessToken(user)
    newRefresh, _ := s.issueRefreshToken(user)
    s.repo.StoreRefreshToken(ctx, user.ID, newRefresh)

    return &AuthResult{
        AccessToken: newAccess,
        ExpiresIn:   900,
        User:         toDTO(user),
    }, nil
}
```

### iOS Auth Client

```swift
// ios/Features/Auth/GoogleSignInProvider.swift
import GoogleSignIn

class GoogleSignInProvider: ObservableObject {
    func signIn(presenting viewController: UIViewController) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            GIDSignIn.sharedInstance.signIn(withPresenting: viewController) { result, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let idToken = result?.user.idToken?.tokenString else {
                    continuation.resume(throwing: AuthError.missingToken)
                    return
                }
                continuation.resume(returning: idToken)
            }
        }
    }
}

// ios/Features/Auth/AppleSignInProvider.swift
import AuthenticationServices

class AppleSignInProvider: NSObject, ASAuthorizationControllerDelegate {
    private var continuation: CheckedContinuation<String, Error>?

    func signIn() async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization auth: ASAuthorization) {
        guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
              let idToken = credential.identityToken,
              let tokenString = String(data: idToken, encoding: .utf8) else {
            continuation?.resume(throwing: AuthError.missingToken)
            return
        }
        continuation?.resume(returning: tokenString)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        continuation?.resume(throwing: error)
    }
}
```

```swift
// ios/Networking/RequestInterceptor.swift — Auto JWT attach + transparent refresh
import Foundation

class AuthRequestInterceptor: URLRequestInterceptor {
    private let tokenStore: KeychainTokenStore

    func intercept(_ request: URLRequest) async throws -> URLRequest {
        var request = request
        if let accessToken = tokenStore.accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    func retry(_ request: URLRequest, for session: URLSession, dueTo error: Error) async throws -> URLRequest? {
        guard let response = (error as? URLError)?.urlResponse as? HTTPURLResponse,
              response.statusCode == 401 else { return nil }

        // Try refresh
        guard let newToken = try? await tokenStore.refreshAccessToken() else {
            // Refresh failed — redirect to login
            NotificationCenter.default.post(name: .sessionExpired, object: nil)
            throw AuthError.sessionExpired
        }

        var retryRequest = request
        retryRequest.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
        return retryRequest
    }
}
```

### Android Auth Client

```kotlin
// android/.../features/auth/GoogleSignInProvider.kt
class GoogleSignInProvider(private val activity: Activity) {
    private val googleSignInClient: GoogleSignInClient by lazy {
        val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(activity.getString(R.string.google_web_client_id))
            .requestEmail()
            .build()
        GoogleSignIn.getClient(activity, options)
    }

    suspend fun signIn(): String = suspendCancellableCoroutine { cont ->
        val signInIntent = googleSignInClient.signInIntent
        // Launch via ActivityResultLauncher, get idToken from result
        // ... (standard Google Sign-In Android flow)
    }
}
```

```kotlin
// android/.../network/AuthInterceptor.kt — Auto JWT + transparent refresh
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        var request = chain.request()

        // Attach access token
        tokenStore.getAccessToken()?.let { token ->
            request = request.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        }

        val response = chain.proceed(request)

        // Transparent refresh on 401
        if (response.code == 401) {
            response.close()
            val newToken = runBlocking { tokenStore.refreshAccessToken() }
                ?: throw AuthException.SessionExpired

            val retriedRequest = request.newBuilder()
                .header("Authorization", "Bearer $newToken")
                .build()
            return chain.proceed(retriedRequest)
        }

        return response
    }
}
```

---

## Offline Sync with CRDT Conflict Resolution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     OFFLINE SYNC FLOW                            │
│                                                                  │
│  Client (Offline)              Server                           │
│  ─────────────────            ──────                            │
│  1. User edits item X                                           │
│  2. Write to local DB                                           │
│     with CRDT metadata:                                         │
│     {                                                           │
│       value: "new text",                                        │
│       vectorClock: {deviceA: 3, deviceB: 2},                    │
│       timestamp: 1718000000,                                    │
│       deviceId: "deviceA",                                      │
│       tombstone: false                                          │
│     }                                                           │
│  3. Queue in sync log                                           │
│                                                                 │
│  ... network returns ...                                         │
│                                                                 │
│  4. POST /api/sync/push                                         │
│     {                                                           │
│       deviceId: "deviceA",                                      │
│       changes: [{                                               │
│         entityId: "X",                                          │
│         entityType: "note",                                     │
│         crdt: {                                                 │
│           operation: "update",                                  │
│           value: "new text",                                    │
│           vectorClock: {deviceA: 3, deviceB: 2},                │
│           timestamp: 1718000000                                 │
│         }                                                       │
│       }]                                                        │
│     }                                                           │
│                                              ┌──────────────┐   │
│                                              │ 5. Server    │   │
│                                              │ receives    │   │
│                                              │ changes     │   │
│                                              └──────┬──────┘   │
│                                                     │          │
│                                              ┌──────▼──────┐   │
│                                              │ 6. For each  │   │
│                                              │ change:     │   │
│                                              │             │   │
│                                              │ a. Load     │   │
│                                              │ server CRDT │   │
│                                              │ state       │   │
│                                              │             │   │
│                                              │ b. Merge:   │   │
│                                              │  server VC  │   │
│                                              │  ∨ client VC│   │
│                                              │  (take max  │   │
│                                              │   per key)  │   │
│                                              │             │   │
│                                              │ c. Apply    │   │
│                                              │ merge       │   │
│                                              │ function   │   │
│                                              │             │   │
│                                              │ d. Store    │   │
│                                              │ merged      │   │
│                                              │ state       │   │
│                                              └──────┬──────┘   │
│                                                     │          │
│  ┌──────────────────────────────────────────────────┐│          │
│  │ 7. Response:                                     ││          │
│  │    { serverChanges: [...],                      ││          │
│  │      mergedState: {                              ││          │
│  │        entityId: "X",                            ││          │
│  │        value: "merged result",                   ││          │
│  │        vectorClock: {deviceA: 3, deviceB: 2}    ││          │
│  │      } }                                        ││          │
│  └──────────────────────────────────────────────────┘│          │
│                                                     │          │
│  8. Client merges server changes                    │          │
│     into local DB using same CRDT                   │          │
│     merge function (deterministic)                  │          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### CRDT Types and Merge Functions

```go
// internal/sync/crdt.go — CRDT merge engine
package sync

import "time"

// CRDT represents a Conflict-free Replicated Data Type
type CRDT interface {
    Merge(other CRDT) CRDT
    Value() interface{}
}

// LWWRegister — Last-Writer-Wins Register
// For primitive fields (strings, numbers, booleans)
type LWWRegister struct {
    Value      interface{} `json:"value"`
    Timestamp  int64       `json:"timestamp"`  // hybrid logical clock
    DeviceID   string      `json:"deviceId"`
}

func (l LWWRegister) Merge(other LWWRegister) LWWRegister {
    // If timestamps differ, last writer wins
    if l.Timestamp > other.Timestamp {
        return l
    }
    if other.Timestamp > l.Timestamp {
        return other
    }
    // Tie-break: lexicographic device ID (deterministic)
    if l.DeviceID > other.DeviceID {
        return l
    }
    return other
}

// ORSet — Observed-Remove Set
// For collections where add/remove can conflict (tags, list items)
type ORSet struct {
    Adds    map[string]int64  `json:"adds"`    // element → timestamp added
    Removes map[string]int64  `json:"removes"` // element → timestamp removed
}

func (o ORSet) Merge(other ORSet) ORSet {
    result := ORSet{Adds: make(map[string]int64), Removes: make(map[string]int64)}
    // Merge adds: take max timestamp for each element
    for k, t := range o.Adds {
        result.Adds[k] = t
    }
    for k, t := range other.Adds {
        if existing, ok := result.Adds[k]; !ok || t > existing {
            result.Adds[k] = t
        }
    }
    // Merge removes: take max timestamp for each element
    for k, t := range o.Removes {
        result.Removes[k] = t
    }
    for k, t := range other.Removes {
        if existing, ok := result.Removes[k]; !ok || t > existing {
            result.Removes[k] = t
        }
    }
    return result
}

func (o ORSet) Value() []string {
    var result []string
    for k, addTime := range o.Adds {
        if removeTime, removed := o.Removes[k]; !removed || addTime > removeTime {
            result = append(result, k)
        }
    }
    return result
}

// VectorClock — causal ordering for concurrent change detection
type VectorClock map[string]int64

func (v VectorClock) Merge(other VectorClock) VectorClock {
    result := make(VectorClock)
    for device, ts := range v {
        result[device] = ts
    }
    for device, ts := range other {
        if existing, ok := result[device]; !ok || ts > existing {
            result[device] = ts
        }
    }
    return result
}

func (v VectorClock) HappenedBefore(other VectorClock) bool {
    atLeastOneBefore := false
    for device, ts := range v {
        if otherTs, ok := other[device]; ok {
            if ts > otherTs {
                return false
            }
            if ts < otherTs {
                atLeastOneBefore = true
            }
        }
    }
    return atLeastOneBefore
}

func (v VectorClock) Increment(deviceID string) VectorClock {
    result := v.Merge(v)
    result[deviceID]++
    return result
}
```

### Sync Service — Server-Side Merge

```go
// internal/sync/sync.service.go
package sync

import "context"

type SyncService struct {
    repo SyncRepository
}

type PushRequest struct {
    DeviceID string         `json:"deviceId"`
    Changes  []EntityChange `json:"changes"`
}

type EntityChange struct {
    EntityID   string      `json:"entityId"`
    EntityType string      `json:"entityType"`
    CRDTData   CRDTState   `json:"crdt"`
}

type SyncResponse struct {
    ServerChanges []EntityChange `json:"serverChanges"`
    MergedStates  []MergedState  `json:"mergedStates"`
}

func (s *SyncService) PushAndPull(ctx context.Context, deviceID string, clientChanges []EntityChange) (*SyncResponse, error) {
    var serverChanges []EntityChange
    var mergedStates []MergedState

    for _, change := range clientChanges {
        // Load server's current CRDT state
        serverState, err := s.repo.GetCRDTState(ctx, change.EntityID, change.EntityType)
        if err != nil {
            return nil, err
        }

        // Merge client state into server state
        merged := mergeCRDT(serverState, change.CRDTData)

        // Persist merged state
        if err := s.repo.SaveCRDTState(ctx, change.EntityID, change.EntityType, merged); err != nil {
            return nil, err
        }

        mergedStates = append(mergedStates, MergedState{
            EntityID:   change.EntityID,
            EntityType: change.EntityType,
            CRDT:       merged,
        })
    }

    // Get server changes client hasn't seen
    serverChanges, err := s.repo.GetChangesSince(ctx, deviceID)
    if err != nil {
        return nil, err
    }

    return &SyncResponse{
        ServerChanges: serverChanges,
        MergedStates:  mergedStates,
    }, nil
}

// mergeCRDT dispatches to the appropriate merge function based on CRDT type
func mergeCRDT(server, client CRDTState) CRDTState {
    switch server.Type {
    case "lww_register":
        serverLWW := LWWRegister{
            Value: server.Value, Timestamp: server.Timestamp, DeviceID: server.DeviceID,
        }
        clientLWW := LWWRegister{
            Value: client.Value, Timestamp: client.Timestamp, DeviceID: client.DeviceID,
        }
        merged := serverLWW.Merge(clientLWW)
        return CRDTState{
            Type: "lww_register", Value: merged.Value,
            Timestamp: merged.Timestamp, DeviceID: merged.DeviceID,
        }
    case "or_set":
        var serverSet, clientSet ORSet
        // deserialize from CRDTState...
        merged := serverSet.Merge(clientSet)
        return CRDTState{Type: "or_set", Value: merged.Value()}
    default:
        // Fallback: last-writer-wins on the entire entity
        if client.Timestamp > server.Timestamp {
            return client
        }
        return server
    }
}
```

### iOS Sync Manager

```swift
// ios/Features/Sync/SyncManager.swift
import Foundation
import CoreData

class SyncManager: ObservableObject {
    private let apiClient: APIClient
    private let coreDataStack: CoreDataStack
    private let crdtEngine: CRDTMergeEngine
    private let deviceId: String

    // Push local changes and pull remote changes
    func sync() async throws {
        let localChanges = try fetchPendingChanges()

        let request = SyncPushRequest(
            deviceId: deviceId,
            changes: localChanges.map { change in
                EntityChange(
                    entityId: change.entityId,
                    entityType: change.entityType,
                    crdt: change.crdtState
                )
            }
        )

        let response: SyncResponse = try await apiClient.post("/api/sync/push", body: request)

        // Apply server changes to local DB
        for serverChange in response.serverChanges {
            try applyServerChange(serverChange)
        }

        // Apply merged states (authoritative)
        for merged in response.mergedStates {
            try applyMergedState(merged)
        }

        // Mark local changes as synced
        try markChangesSynced(localChanges)
    }

    private func applyServerChange(_ change: EntityChange) throws {
        let localState = try loadLocalCRDT(entityId: change.entityId, type: change.entityType)
        let merged = crdtEngine.merge(local: localState, remote: change.crdt)
        try saveLocalCRDT(merged, entityId: change.entityId, type: change.entityType)
    }
}
```

```swift
// ios/Features/Sync/CRDTMergeEngine.swift
struct LWWRegister: Codable {
    let value: AnyCodable
    let timestamp: Int64
    let deviceId: String

    func merge(with other: LWWRegister) -> LWWRegister {
        if timestamp > other.timestamp { return self }
        if other.timestamp > timestamp { return other }
        // Tie-break: deterministic device ID comparison
        return deviceId > other.deviceId ? self : other
    }
}

class CRDTMergeEngine {
    /// Deterministic merge — same result regardless of merge order
    func merge(local: CRDTState, remote: CRDTState) -> CRDTState {
        switch local.type {
        case "lww_register":
            let localLWW = LWWRegister(
                value: local.value, timestamp: local.timestamp, deviceId: local.deviceId
            )
            let remoteLWW = LWWRegister(
                value: remote.value, timestamp: remote.timestamp, deviceId: remote.deviceId
            )
            let merged = localLWW.merge(with: remoteLWW)
            return CRDTState(
                type: "lww_register", value: merged.value,
                timestamp: merged.timestamp, deviceId: merged.deviceId
            )
        case "or_set":
            // OR-Set merge: union of adds minus elements removed after their add
            return mergeORSet(local: local, remote: remote)
        default:
            // Fallback: LWW on entire entity
            return local.timestamp >= remote.timestamp ? local : remote
        }
    }
}
```

### Android Sync Manager

```kotlin
// android/.../features/sync/SyncManager.kt
class SyncManager(
    private val apiClient: ApiClient,
    private val database: AppDatabase,
    private val crdtEngine: CRDTMergeEngine,
    private val deviceId: String
) {
    suspend fun sync(): Result<SyncResponse> = runCatching {
        val localChanges = database.syncLogDao().getPendingChanges()

        val request = SyncPushRequest(
            deviceId = deviceId,
            changes = localChanges.map { it.toEntityChange() }
        )

        val response = apiClient.post<SyncResponse>("/api/sync/push", request)

        // Apply server changes
        response.serverChanges.forEach { change ->
            val localState = database.crdtDao().getState(change.entityId, change.entityType)
            val merged = crdtEngine.merge(localState, change.crdt)
            database.crdtDao().upsert(merged)
        }

        // Apply authoritative merged states
        response.mergedStates.forEach { merged ->
            database.crdtDao().upsert(merged.toCRDTState())
        }

        // Mark local changes as synced
        database.syncLogDao().markSynced(localChanges.map { it.id })

        response
    }
}
```

```kotlin
// android/.../features/sync/CRDTMergeEngine.kt
class CRDTMergeEngine {
    fun merge(local: CRDTState, remote: CRDTState): CRDTState {
        return when (local.type) {
            "lww_register" -> mergeLWW(local, remote)
            "or_set" -> mergeORSet(local, remote)
            else -> if (local.timestamp >= remote.timestamp) local else remote
        }
    }

    private fun mergeLWW(local: CRDTState, remote: CRDTState): CRDTState {
        return when {
            local.timestamp > remote.timestamp -> local
            remote.timestamp > local.timestamp -> remote
            else -> if (local.deviceId > remote.deviceId) local else remote
        }
    }

    private fun mergeORSet(local: CRDTState, remote: CRDTState): CRDTState {
        // Union of adds, minus elements where remove timestamp > add timestamp
        val mergedAdds = (local.adds.keys + remote.adds.keys).associateWith { element ->
            maxOf(local.adds[element] ?: 0L, remote.adds[element] ?: 0L)
        }
        val mergedRemoves = (local.removes.keys + remote.removes.keys).associateWith { element ->
            maxOf(local.removes[element] ?: 0L, remote.removes[element] ?: 0L)
        }
        return CRDTState(type = "or_set", adds = mergedAdds, removes = mergedRemoves)
    }
}
```

### Database Schema (CockroachDB)

```sql
-- migrations/001_create_users.up.sql
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       STRING(255) UNIQUE NOT NULL,
    name        STRING(255),
    avatar_url  STRING(1024),
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_auth_providers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider    STRING(20) NOT NULL,  -- 'google' or 'apple'
    provider_id STRING(255) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (provider, provider_id)
);

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  STRING(64) NOT NULL,  -- SHA-256 of refresh token
    device_id   STRING(255),
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOL DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- migrations/002_create_sync_log.up.sql
CREATE TABLE crdt_entities (
    entity_id    STRING(255) NOT NULL,
    entity_type  STRING(50) NOT NULL,
    crdt_type    STRING(30) NOT NULL,  -- 'lww_register', 'or_set'
    value         JSONB,
    vector_clock JSONB NOT NULL,       -- {"deviceA": 3, "deviceB": 2}
    timestamp     INT NOT NULL,         -- hybrid logical clock
    device_id     STRING(255) NOT NULL,
    tombstone     BOOL DEFAULT FALSE,
    updated_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (entity_id, entity_type)
);

CREATE TABLE sync_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id    STRING(255) NOT NULL,
    entity_id    STRING(255) NOT NULL,
    entity_type  STRING(50) NOT NULL,
    operation    STRING(10) NOT NULL,  -- 'create', 'update', 'delete'
    crdt_data    JSONB NOT NULL,
    synced       BOOL DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_log_device ON sync_log(device_id, synced);
CREATE INDEX idx_sync_log_entity ON sync_log(entity_id, entity_type);

-- migrations/002_create_sync_log.down.sql
DROP TABLE sync_log;
DROP TABLE crdt_entities;
```

### Push Notification Service

```go
// internal/push/push.service.go
package push

type PushService struct {
    apns *APNSProvider
    fcm  *FCMProvider
    repo PushRepository
}

type PushMessage struct {
    UserID  string
    Title   string
    Body    string
    Data    map[string]interface{}
}

func (s *PushService) Send(ctx context.Context, msg PushMessage) error {
    devices, err := s.repo.GetDevicesForUser(ctx, msg.UserID)
    if err != nil {
        return err
    }

    var lastErr error
    for _, device := range devices {
        switch device.Platform {
        case "ios":
            if err := s.apns.Send(ctx, device.Token, msg); err != nil {
                lastErr = err
                s.logger.Warn("APNs send failed", "deviceID", device.ID, "error", err)
            }
        case "android":
            if err := s.fcm.Send(ctx, device.Token, msg); err != nil {
                lastErr = err
                s.logger.Warn("FCM send failed", "deviceID", device.ID, "error", err)
            }
        }
    }
    return lastErr
}
```

---

## Configuration (Go — Centralized, Fail-Fast)

```go
// internal/config/config.go
package config

import (
    "fmt"
    "os"
    "strconv"
)

type Config struct {
    Port        int
    DatabaseURL string
    RedisURL    string
    Auth        AuthConfig
    Push        PushConfig
}

type AuthConfig struct {
    JWTPrivateKeyPath string
    JWTRefreshSecret   string
    AccessTokenExpiry  int // seconds
    RefreshTokenExpiry int // seconds
    GoogleClientID     string
    GoogleClientSecret string
    AppleTeamID        string
    AppleKeyID         string
    ApplePrivateKeyPath string
}

type PushConfig struct {
    APNSKeyID      string
    APNSTeamID     string
    APNSPrivateKeyPath string
    FCMServerKey   string
}

func Load() *Config {
    return &Config{
        Port:        envInt("PORT", 8080),
        DatabaseURL: requiredEnv("DATABASE_URL"),
        RedisURL:    requiredEnv("REDIS_URL"),
        Auth: AuthConfig{
            JWTPrivateKeyPath:  requiredEnv("JWT_PRIVATE_KEY_PATH"),
            JWTRefreshSecret:   requiredEnv("JWT_REFRESH_SECRET"),
            AccessTokenExpiry:  envInt("ACCESS_TOKEN_EXPIRY", 900),
            RefreshTokenExpiry: envInt("REFRESH_TOKEN_EXPIRY", 604800),
            GoogleClientID:     requiredEnv("GOOGLE_CLIENT_ID"),
            GoogleClientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
            AppleTeamID:        requiredEnv("APPLE_TEAM_ID"),
            AppleKeyID:         requiredEnv("APPLE_KEY_ID"),
            ApplePrivateKeyPath: requiredEnv("APPLE_PRIVATE_KEY_PATH"),
        },
        Push: PushConfig{
            APNSKeyID:         requiredEnv("APNS_KEY_ID"),
            APNSTeamID:        requiredEnv("APNS_TEAM_ID"),
            APNSPrivateKeyPath: requiredEnv("APNS_PRIVATE_KEY_PATH"),
            FCMServerKey:      requiredEnv("FCM_SERVER_KEY"),
        },
    }
}

func requiredEnv(name string) string {
    val := os.Getenv(name)
    if val == """ {
        panic(fmt.Sprintf("Missing required env var: %s", name))
    }
    return val
}

func envInt(name string, defaultVal int) int {
    val := os.Getenv(name)
    if val == "" {
        return defaultVal
    }
    n, err := strconv.Atoi(val)
    if err != nil {
        panic(fmt.Sprintf("Invalid int for env var %s: %v", name, err))
    }
    return n
}
```

---

## Global Error Handler (Go)

```go
// internal/middleware/error_handler.go
package middleware

func ErrorHandler(logger *slog.Logger) func(next http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            defer func() {
                if rec := recover(); rec != nil {
                    logger.Error("panic recovered",
                        "error", rec,
                        "requestId", r.Context().Value(requestIDKey),
                        "path", r.URL.Path,
                    )
                    writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
                        "error":     "INTERNAL_ERROR",
                        "status":    500,
                        "requestId": r.Context().Value(requestIDKey),
                    })
                }
            }()

            next.ServeHTTP(w, r)
        })
    }
}

func HandleAppError(w http.ResponseWriter, r *http.Request, err error, logger *slog.Logger) {
    requestID := r.Context().Value(requestIDKey)

    if appErr, ok := err.(*errors.AppError); ok && appErr.Operational {
        logger.Warn("operational error",
            "code", appErr.Code,
            "detail", appErr.Message,
            "requestId", requestID,
        )
        writeJSON(w, appErr.StatusCode, map[string]interface{}{
            "error":     appErr.Code,
            "status":    appErr.StatusCode,
            "detail":    appErr.Message,
            "requestId": requestID,
        })
        return
    }

    // Programming error — log full detail, return generic 500
    logger.Error("unexpected error",
        "error", err.Error(),
        "stack", debug.Stack(),
        "requestId", requestID,
    )
    writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
        "error":     "INTERNAL_ERROR",
        "status":    500,
        "requestId": requestID,
    })
}
```

---

## Cross-Boundary Error Handling (Mobile)

```swift
// ios/Networking/APIError.swift
enum APIError: Error {
    case unauthorized
    case forbidden
    case notFound
    case conflict
    case validationError([String: String])
    case rateLimited
    case serverError
    case networkUnavailable

    var userMessage: String {
        switch self {
        case .unauthorized: return "Please log in to continue."
        case .forbidden: return "You don't have permission to do this."
        case .notFound: return "The item you're looking for doesn't exist."
        case .conflict: return "This conflicts with an existing item."
        case .validationError(let fields):
            return fields.values.joined(separator: ". ")
        case .rateLimited: return "Too many requests. Please wait a moment."
        case .serverError: return "Something went wrong. Please try again."
        case .networkUnavailable: return "Cannot connect to server. Check your internet connection."
        }
    }
}
```

```kotlin
// android/.../util/ErrorMessageMapper.kt
object ErrorMessageMapper {
    fun map(error: ApiError): String = when (error.status) {
        401 -> "Please log in to continue."
        403 -> "You don't have permission to do this."
        404 -> "The item you're looking for doesn't exist."
        409 -> "This conflicts with an existing item."
        422 -> error.fieldErrors?.values?.joinToString(". ") ?: "Please check your input."
        429 -> "Too many requests. Please wait a moment."
        in 500..599 -> "Something went wrong. Please try again."
        else -> "An unexpected error occurred."
    }

    fun mapNetworkError(error: Throwable): String = when (error) {
        is java.net.UnknownHostException -> "Cannot connect to server. Check your internet connection."
        is java.net.SocketTimeoutException -> "Request timed out. Please try again."
        else -> "An unexpected error occurred."
    }
}
```

---

## Step 4: Verification Checklist

| Check | How to Verify |
|-------|---------------|
| **Build check** | `go build ./...` for backend; Xcode build for iOS; Gradle build for Android |
| **Smoke test** | Start Go server, hit `/health` → `{"status":"ok'}`; hit `/api/auth/google` with mock token → JWT response |
| **Integration check** | iOS client calls `/api/auth/google` → gets access token; Android client same flow |
| **Auth flow** | Full OAuth2 flow: Google Sign-In → backend verify → JWT issued → refresh works on 401 |
| **Sync flow** | Create entity offline → sync → verify merged state matches on both client and server |
| **CRDT merge** | Two devices edit same field concurrently → push to server → both receive deterministic merged result |

---

## Step 5: Handoff Summary

**What was built:** Full architecture for a cross-platform mobile app with Go backend, including:
- Feature-first project structure for Go, Swift, and Kotlin
- OAuth2 auth flow (Google + Apple Sign-In) with JWT access + refresh token rotation
- CRDT-based offline sync with LWW-Register and OR-Set merge functions
- Push notification service (APNs + FCM)
- Typed error hierarchy, global error handler, and cross-boundary error mapping
- CockroachDB schema with migrations
- Centralized config with fail-fast validation

**How to run:**
```bash
# Backend
cd backend && go run cmd/api/main.go

# iOS
cd ios && open App.xcodeproj  # Build & run in Xcode

# Android
cd android && ./gradlew installDebug
```

**Key files:**
- `backend/internal/auth/auth.service.go` — OAuth2 + JWT flow
- `backend/internal/sync/crdt.go` — CRDT merge engine (LWW + OR-Set)
- `backend/internal/sync/sync.service.go` — Push-and-pull sync endpoint
- `backend/internal/config/config.go` — Centralized config
- `backend/internal/middleware/error_handler.go` — Global error handler
- `ios/Features/Sync/CRDTMergeEngine.swift` — iOS CRDT merge
- `android/.../features/sync/CRDTMergeEngine.kt` — Android CRDT merge

**What's missing / next steps:**
- gRPC proto definitions and service implementations for inter-service communication
- CockroachDB migration runner setup (golang-migrate or goose)
- Redis session storage implementation
- Background job worker (push notification queuing, sync cleanup)
- E2E tests for CRDT merge correctness (concurrent edit scenarios)
- Rate limiting middleware implementation
- CI/CD pipeline configuration