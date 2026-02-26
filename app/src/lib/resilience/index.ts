/**
 * Resilience Module — Barrel Export
 *
 * Why: Single import point for all resilience primitives.
 */

export { withRetry, classifyError, type ClassifiedError, type RetryOptions } from './retry-strategy';
export { withCircuitBreaker, CircuitOpenError, getCircuitStatus, type CircuitState, type CircuitStatus } from './circuit-breaker';
export { moveToDeadLetter, listDeadLetterPosts, retryDeadLetterPost, getDeadLetterCount, removeFromDeadLetter } from './dead-letter';
export { recordOutcome, getHealthStatus, getAllPlatformHealth, isPlatformHealthy, type PlatformHealthStatus, type HealthState } from './platform-health';
