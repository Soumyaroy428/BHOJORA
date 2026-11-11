import type { AppConfig } from '../../config/env-types';

export interface LivenessPayload {
  service: string;
  version: string;
  status: 'ok';
  environment: AppConfig['nodeEnv'];
  timezone: string;
  cityCode: string;
  currency: 'INR';
  uptimeSeconds: number;
}

export interface ReadinessCheckOutcome {
  status: 'pass' | 'fail';
  detail?: string;
}

export interface ReadinessCheckResult extends ReadinessCheckOutcome {
  name: string;
  latencyMs: number;
}

export interface ReadinessProbe {
  name: string;
  check: () => Promise<ReadinessCheckOutcome> | ReadinessCheckOutcome;
}

export interface ReadinessPayload {
  service: string;
  version: string;
  status: 'ready' | 'not_ready';
  ready: boolean;
  checks: ReadinessCheckResult[];
}

export interface HealthServiceOptions {
  config: AppConfig;
  startedAtMs?: number;
  getIsShuttingDown?: () => boolean;
  probes?: readonly ReadinessProbe[];
}

export function createHealthService(options: HealthServiceOptions) {
  const startedAtMs = options.startedAtMs ?? Date.now();
  const getIsShuttingDown = options.getIsShuttingDown ?? (() => false);
  const probes = options.probes ?? [];

  return {
    getLiveness(): LivenessPayload {
      return {
        service: options.config.serviceName,
        version: options.config.serviceVersion,
        status: 'ok',
        environment: options.config.nodeEnv,
        timezone: options.config.appTimezone,
        cityCode: options.config.defaultCityCode,
        currency: options.config.defaultCurrency,
        uptimeSeconds: Number(Math.max(0, (Date.now() - startedAtMs) / 1000).toFixed(2)),
      };
    },

    async getReadiness(): Promise<ReadinessPayload> {
      const shuttingDown = getIsShuttingDown();
      const lifecycleCheck: ReadinessCheckResult = shuttingDown
        ? {
            name: 'process-lifecycle',
            status: 'fail',
            detail: 'Server shutdown in progress',
            latencyMs: 0,
          }
        : {
            name: 'process-lifecycle',
            status: 'pass',
            detail: 'Process active and accepting traffic',
            latencyMs: 0,
          };

      const probeChecks = await Promise.all(
        probes.map(async (probe): Promise<ReadinessCheckResult> => {
          const startNs = process.hrtime.bigint();
          try {
            const outcome = await probe.check();
            const latencyMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
            return {
              name: probe.name,
              status: outcome.status,
              detail: outcome.detail,
              latencyMs: Number(latencyMs.toFixed(2)),
            };
          } catch {
            const latencyMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
            return {
              name: probe.name,
              status: 'fail',
              detail: 'Dependency readiness check failed',
              latencyMs: Number(latencyMs.toFixed(2)),
            };
          }
        }),
      );

      const checks = [lifecycleCheck, ...probeChecks];
      const ready = checks.every((check) => check.status === 'pass');

      return {
        service: options.config.serviceName,
        version: options.config.serviceVersion,
        status: ready ? 'ready' : 'not_ready',
        ready,
        checks,
      };
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
