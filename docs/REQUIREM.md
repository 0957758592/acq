FULL PRODUCTION REQUIREMENTS (BACKEND + FRONTEND)

⸻

0. ENGINEERING PRINCIPLES (MANDATORY)

0.1 Core

* SOLID
* DRY
* KISS
* YAGNI (controlled)
* Separation of Concerns
* Composition over inheritance
* Explicit dependencies (no hidden coupling)

0.2 Determinism

* No nondeterministic behavior in business logic
* All side-effects isolated
* Pure functions where applicable

0.3 Modularity

* Bounded contexts
* Independent deployable modules (if needed)
* No cyclic dependencies

⸻

1. ARCHITECTURE

1.1 Style

* Clean Architecture (strict layers)
* Hexagonal (Ports & Adapters)
* Domain-driven structure (at least tactical DDD)

1.2 Layers

* Presentation (Controllers / UI)
* Application (Use Cases)
* Domain (Entities, Value Objects)
* Infrastructure (DB, APIs, queues)

1.3 Rules

* Domain has zero external dependencies
* Infrastructure depends on domain, never reverse
* Interfaces defined inward, implementations outward

⸻

2. BACKEND — FULL REQUIREMENTS

2.1 API DESIGN

* OpenAPI / JSON Schema contract-first
* Versioning strategy (URI or header)
* Idempotency (POST/PUT critical ops)
* Consistent response envelope:
    * data
    * error
    * meta

2.2 VALIDATION

* Strict schema validation (runtime + compile-time)
* Type-safe DTOs
* Reject unknown fields
* Sanitization layer

2.3 DOMAIN MODELING

* Aggregates enforce invariants
* Value Objects for primitives
* No primitive obsession
* Explicit domain events

2.4 BUSINESS LOGIC

* No logic in controllers
* No logic in repositories
* Use cases = single responsibility units

2.5 DATA MANAGEMENT

Storage

* ACID compliance where needed
* Eventual consistency where acceptable

Patterns

* Repository pattern
* Unit of Work (transaction boundaries)
* CQRS (when scaling reads)

Optimization

* Indexing strategy
* Query plan validation
* Pagination mandatory (cursor-based preferred)

⸻

3. ALGORITHMIC REQUIREMENTS

3.1 Complexity

* Time complexity must be defined (O notation)
* Avoid O(n²) in scalable paths
* Prefer O(log n), O(1)

3.2 Data Structures

* Correct structure per use case:
    * HashMap → O(1) lookup
    * Heap → priority queues
    * Trie → search/autocomplete
    * Set → uniqueness guarantees

3.3 Concurrency

* No race conditions
* Locking strategy (optimistic/pessimistic)
* Idempotent operations
* Atomic updates

3.4 Distributed Systems

* Eventual consistency awareness
* Deduplication strategies
* Exactly-once vs at-least-once handling

⸻

4. SECURITY (OWASP + ZERO TRUST)

4.1 Authentication

* OAuth2 / OIDC / JWT
* Token rotation
* Short-lived access tokens
* Refresh token isolation

4.2 Authorization

* RBAC or ABAC
* Policy-based access control
* Least privilege

4.3 Input Security

* Validation (strict schemas)
* Sanitization
* No direct DB queries from raw input

4.4 Transport Security

* TLS 1.2+
* HSTS
* Secure headers

4.5 Data Protection

* Encryption at rest (AES-256)
* Encryption in transit
* Secrets in vault (never in code)

4.6 Attack Protection

* Rate limiting
* Brute-force protection
* DDoS mitigation (edge/CDN)
* CSRF protection
* XSS prevention
* SQL injection prevention

4.7 Audit

* Immutable logs
* Security event tracking
* Access logs

⸻

5. PERFORMANCE

5.1 Backend

* Caching:
    * In-memory
    * Distributed (Redis)
* Connection pooling
* Async jobs (queues)

5.2 Frontend

* Code splitting
* Lazy loading
* Asset optimization

5.3 Network

* Compression (gzip/brotli)
* HTTP/2 or HTTP/3
* CDN usage

⸻

6. OBSERVABILITY

6.1 Logging

* Structured logs (JSON)
* Correlation ID per request

6.2 Metrics

* Latency
* Throughput
* Error rate
* Saturation

6.3 Tracing

* Distributed tracing
* Span-level visibility

6.4 Alerting

* SLO-based alerts
* Error budget tracking

⸻

7. FRONTEND — FULL REQUIREMENTS

7.1 ARCHITECTURE

* Feature-based structure
* Component isolation
* Reusable UI primitives

7.2 STATE MANAGEMENT

* Server state vs client state separation
* No global mutable state
* Predictable state transitions

7.3 DATA FLOW

* Typed API client
* Request caching
* Retry logic with backoff

7.4 UI/UX

* Accessibility (WCAG 2.1)
* Responsive design
* Predictable interactions

7.5 SECURITY

* CSP headers
* No unsafe HTML rendering
* Secure token handling

⸻

8. ERROR HANDLING

8.1 Backend

* Centralized error handler
* Typed error classes
* No stack traces in response

8.2 Frontend

* Error boundaries
* User-friendly errors
* Retry mechanisms

⸻

9. INTEGRATIONS

9.1 External APIs

* Timeout
* Retry with backoff
* Circuit breaker

9.2 Webhooks

* Signature verification
* Idempotency
* Replay protection

⸻

10. BACKGROUND PROCESSING

* Queue system (BullMQ / Kafka)
* Retry policies
* Dead-letter queue
* Job idempotency

⸻

11. CONFIGURATION

* 12-factor config
* Environment isolation
* Feature flags
* No hardcoded values

⸻

12. CI/CD

12.1 Pipeline

* Lint
* Type check
* Tests
* Build

12.2 Security

* Dependency scanning
* SAST

12.3 Deployment

* Blue/Green or Canary
* Rollback strategy

⸻

13. INFRASTRUCTURE

* Docker
* Orchestration (Kubernetes optional)
* Auto-scaling
* Load balancing

⸻

14. TESTING

* Unit tests (domain)
* Integration tests
* Contract tests
* E2E tests
* Load tests

⸻

15. DATA & COMPLIANCE

* GDPR compliance
* Data minimization
* Right to delete
* Audit trails

⸻

16. RELIABILITY

* Graceful degradation
* Failover strategy
* Redundancy
* Health checks

⸻

17. ANTI-PATTERNS

* Business logic in controllers
* Shared mutable state
* Hardcoded configs
* Tight coupling frontend ↔ backend
* No validation
* No observability

⸻

18. PRODUCTION READINESS CHECKLIST

* Auth + authorization
* Validation everywhere
* Logging + metrics
* Error handling unified
* Retry + timeout
* DB indexed
* API versioned
* Security headers enabled
* CI/CD pipeline working

⸻

19. SCALABILITY REQUIREMENTS

* Horizontal scaling ready
* Stateless services
* Externalized session/state
* Queue-based load leveling

⸻

20. FINAL RULE

System must remain:

* deterministic
* observable
* secure
* scalable
* maintainable

No exceptions.

!!!! ТРЕБОВАНИЯ!!!!
все должно быть модульно, централизованно, маштабируемо, компонентный подход, все по бест практис, без моков и заглушек, без дублирования кода и хардкода, без сет таймаут или сет интервал, одинакового кода не должно быть - если есть то выносить в отдельный файл, секьюрно, оптимизированно, уже production mode для деплоя, используя текущую архитектуру
преждже чем писать - нужно все проверять по факту!

поэтому тут очень важно следовать высоким стандартам архитектуры прилложения со всеми it требованиямии и предполагакмыми нагрузками одновременно подключая несколько разных компаний с разными атс - данный проект должен работать с высокими нагрузками на сервисы, телефонии, ии, телеграм. воркер, редис, бд, вообще все сервисы а также всю систему в целом!! 

всегда прежде чем писать код - проверяй есть ли такой код/функция, проверяй архитектуру и требования

все ответы пиши на русском