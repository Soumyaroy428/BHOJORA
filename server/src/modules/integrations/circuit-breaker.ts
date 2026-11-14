import { AppError } from '../../middleware/error-handler';
import type { CircuitBreakerMetricsDto, CircuitBreakerState } from '@bhojora/shared';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenSuccessThreshold?: number;
  timeoutMs?: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private halfOpenSuccesses = 0;
  private totalSuccesses = 0;
  private totalFailures = 0;
  private totalRequests = 0;
  private fallbackCount = 0;
  private lastFailureTime: number | null = null;
  private lastStateChange: string = new Date().toISOString();

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly timeoutMs: number;

  constructor(
    public readonly name: string,
    options: CircuitBreakerOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 10000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  public async execute<T>(action: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    this.totalRequests += 1;
    this.evaluateState();

    if (this.state === 'OPEN') {
      if (fallback) {
        this.fallbackCount += 1;
        return await fallback();
      }
      throw new AppError(
        503,
        'SERVICE_UNAVAILABLE',
        `Circuit breaker for '${this.name}' is OPEN. Fast-failing external integration request without false success.`,
      );
    }

    try {
      const result = await this.executeWithTimeout(action);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      if (fallback) {
        this.fallbackCount += 1;
        return await fallback();
      }
      throw error;
    }
  }

  public getMetrics(): CircuitBreakerMetricsDto {
    this.evaluateState();
    return {
      state: this.state,
      failureCount: this.totalFailures,
      successCount: this.totalSuccesses,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      lastStateChange: this.lastStateChange,
      totalRequests: this.totalRequests,
      fallbackCount: this.fallbackCount,
    };
  }

  public reset(): void {
    this.transitionTo('CLOSED');
    this.consecutiveFailures = 0;
    this.halfOpenSuccesses = 0;
    this.lastFailureTime = null;
  }

  public trip(): void {
    this.transitionTo('OPEN');
    this.lastFailureTime = Date.now();
  }

  private evaluateState(): void {
    if (this.state === 'OPEN' && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
        this.halfOpenSuccesses = 0;
      }
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.lastStateChange = new Date().toISOString();
    }
  }

  private recordSuccess(): void {
    this.totalSuccesses += 1;
    this.consecutiveFailures = 0;

    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
        this.transitionTo('CLOSED');
        this.halfOpenSuccesses = 0;
      }
    }
  }

  private recordFailure(_error: unknown): void {
    this.totalFailures += 1;
    this.consecutiveFailures += 1;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private async executeWithTimeout<T>(action: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new AppError(
            504,
            'SERVICE_UNAVAILABLE',
            `Integration provider '${this.name}' exceeded timeout threshold of ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([action(), timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
