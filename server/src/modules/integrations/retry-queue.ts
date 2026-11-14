import { randomUUID } from 'crypto';
import type { DlqJobDto, IntegrationProvider } from '@bhojora/shared';

export interface EnqueueJobOptions {
  provider: IntegrationProvider;
  action: string;
  payload: Record<string, unknown>;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export class ResilientRetryQueue {
  private jobs: Map<string, DlqJobDto> = new Map();

  public calculateBackoff(
    attempt: number,
    baseDelayMs = 100,
    maxDelayMs = 5000,
    withJitter = true,
  ): number {
    const exponential = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
    const capped = Math.min(maxDelayMs, exponential);
    if (!withJitter) {
      return capped;
    }
    const jitter = Math.floor(Math.random() * (baseDelayMs * 0.5));
    return capped + jitter;
  }

  public enqueueJob(options: EnqueueJobOptions): DlqJobDto {
    const id = `job_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const job: DlqJobDto = {
      id,
      provider: options.provider,
      action: options.action,
      payload: options.payload,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      lastError: '',
      firstFailedAt: now,
      lastFailedAt: now,
      nextRetryAt: now,
      status: 'QUEUED',
    };
    this.jobs.set(id, job);
    return structuredClone(job);
  }

  public async executeWithRetries<T>(
    options: EnqueueJobOptions,
    taskFn: () => Promise<T>,
  ): Promise<T> {
    const job = this.enqueueJob(options);
    const maxAttempts = job.maxAttempts;
    let attempt = 0;
    let lastError = new Error('Unknown integration error');

    while (attempt < maxAttempts) {
      attempt += 1;
      job.attempts = attempt;
      job.status = 'RETRYING';
      job.lastFailedAt = new Date().toISOString();

      try {
        const result = await taskFn();
        job.status = 'RESOLVED';
        job.nextRetryAt = null;
        this.jobs.set(job.id, job);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        job.lastError = lastError.message;

        if (attempt < maxAttempts) {
          const delay = this.calculateBackoff(
            attempt,
            options.baseDelayMs ?? 100,
            options.maxDelayMs ?? 3000,
          );
          job.nextRetryAt = new Date(Date.now() + delay).toISOString();
          this.jobs.set(job.id, job);
          await new Promise((res) => setTimeout(res, delay));
        } else {
          job.status = 'EXHAUSTED';
          job.nextRetryAt = null;
          this.jobs.set(job.id, job);
          throw lastError;
        }
      }
    }

    throw lastError;
  }

  public getDlqJobs(status?: DlqJobDto['status']): DlqJobDto[] {
    const list = Array.from(this.jobs.values());
    if (status) {
      return list.filter((j) => j.status === status);
    }
    return list.filter((j) => j.status === 'EXHAUSTED');
  }

  public getJobById(id: string): DlqJobDto | null {
    const found = this.jobs.get(id);
    return found ? structuredClone(found) : null;
  }

  public async retryExhaustedJob<T>(
    id: string,
    taskFn: (job: DlqJobDto) => Promise<T>,
  ): Promise<T> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`DLQ Job '${id}' not found`);
    }

    job.status = 'RETRYING';
    job.attempts += 1;
    job.lastFailedAt = new Date().toISOString();

    try {
      const result = await taskFn(job);
      job.status = 'RESOLVED';
      job.nextRetryAt = null;
      this.jobs.set(id, job);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      job.lastError = errorMsg;
      job.status = 'EXHAUSTED';
      this.jobs.set(id, job);
      throw err;
    }
  }

  public getSummary() {
    const list = Array.from(this.jobs.values());
    const pendingCount = list.filter(
      (j) => j.status === 'QUEUED' || j.status === 'RETRYING',
    ).length;
    const exhaustedCount = list.filter((j) => j.status === 'EXHAUSTED').length;
    const oldestItem = list
      .filter((j) => j.status === 'EXHAUSTED')
      .sort((a, b) => new Date(a.firstFailedAt).getTime() - new Date(b.firstFailedAt).getTime())[0];

    return {
      pendingCount,
      exhaustedCount,
      oldestItemTimestamp: oldestItem ? oldestItem.firstFailedAt : null,
    };
  }
}
