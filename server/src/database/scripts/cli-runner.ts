import type { Connection } from 'mongoose';
import { ConfigValidationError, loadLocalEnvIfPresent, validateEnv } from '../../config/env';
import type { AppConfig } from '../../config/env-types';
import { createLogger, type Logger } from '../../config/logger';
import { createDatabaseManager, DatabaseConnectionError } from '../connection';

export async function runDatabaseCliTask(
  taskName: string,
  work: (ctx: { config: AppConfig; logger: Logger; connection: Connection }) => Promise<void>,
): Promise<void> {
  loadLocalEnvIfPresent();

  let config: AppConfig;
  try {
    config = validateEnv(process.env, { serviceName: 'bhojora-db-cli', serviceVersion: '0.1.0' });
  } catch (error) {
    const bootstrapLogger = createLogger({
      level: 'error',
      service: 'bhojora-db-cli',
      environment: process.env['NODE_ENV'] ?? 'unknown',
      includeStack: false,
    });
    if (error instanceof ConfigValidationError) {
      bootstrapLogger.error('cli.config.invalid', { taskName, issues: error.issues });
    } else {
      bootstrapLogger.error('cli.config.unexpected_error', { taskName, error });
    }
    process.exit(1);
  }

  const logger = createLogger({
    level: config.logLevel,
    service: `bhojora-${taskName}`,
    environment: config.nodeEnv,
    includeStack: config.nodeEnv !== 'production',
  });

  const dbManager = createDatabaseManager({ config, logger });
  try {
    const connection = await dbManager.connect();
    await work({ config, logger, connection });
  } catch (error) {
    if (error instanceof DatabaseConnectionError) {
      logger.error('cli.database.connection_failed', { taskName, uri: error.sanitizedUri });
    } else {
      logger.error('cli.database.task_failed', { taskName, error });
    }
    process.exitCode = 1;
  } finally {
    await dbManager.disconnect();
  }
}
