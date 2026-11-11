import mongoose, { type Connection, type Mongoose } from 'mongoose';
import type { AppConfig } from '../config/env-types';
import type { Logger } from '../config/logger';
import type { ReadinessCheckOutcome, ReadinessProbe } from '../modules/health/health.service';

export class DatabaseConnectionError extends Error {
  public readonly sanitizedUri: string;

  constructor(message: string, sanitizedUri: string) {
    super(message);
    this.name = 'DatabaseConnectionError';
    this.sanitizedUri = sanitizedUri;
  }
}

export function sanitizeMongoUri(uri: string): string {
  return uri
    .replace(/(mongodb(?:\+srv)?:\/\/)([^/@\s:]+):([^/@\s]+)@/gi, '$1[REDACTED]:[REDACTED]@')
    .replace(/([?&](?:authSource|password|token|key)=)[^&]+/gi, '$1[REDACTED]');
}

export interface CreateDatabaseManagerOptions {
  config: Pick<
    AppConfig,
    | 'mongodbUri'
    | 'mongodbServerSelectionTimeoutMs'
    | 'mongodbConnectTimeoutMs'
    | 'mongodbMaxPoolSize'
    | 'mongodbAutoIndex'
  >;
  logger: Logger;
  mongooseInstance?: Mongoose;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function createDatabaseManager(options: CreateDatabaseManagerOptions) {
  const { config, logger } = options;
  const mongooseInstance = options.mongooseInstance ?? mongoose;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const retryBaseDelayMs = Math.max(10, options.retryBaseDelayMs ?? 200);
  const sleep = options.sleep ?? defaultSleep;
  const sanitizedUri = sanitizeMongoUri(config.mongodbUri);

  let connection: Connection | null = null;

  const connect = async (): Promise<Connection> => {
    if (connection && connection.readyState === 1) {
      return connection;
    }

    let lastErrorName = 'UnknownDatabaseError';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const candidate = mongooseInstance.createConnection(config.mongodbUri, {
        serverSelectionTimeoutMS: config.mongodbServerSelectionTimeoutMs,
        connectTimeoutMS: config.mongodbConnectTimeoutMs,
        maxPoolSize: config.mongodbMaxPoolSize,
        autoIndex: config.mongodbAutoIndex,
      });

      try {
        await candidate.asPromise();
        connection = candidate;
        logger.info('database.connection.established', {
          uri: sanitizedUri,
          attempt,
          autoIndex: config.mongodbAutoIndex,
        });
        return candidate;
      } catch (err) {
        lastErrorName = err instanceof Error ? err.name : 'DatabaseConnectFailure';
        await candidate.close().catch(() => {});

        logger.warn('database.connection.attempt_failed', {
          uri: sanitizedUri,
          attempt,
          maxAttempts,
          errorName: lastErrorName,
        });

        if (attempt < maxAttempts) {
          const backoffMs = retryBaseDelayMs * Math.pow(2, attempt - 1);
          await sleep(backoffMs);
        }
      }
    }

    logger.error('database.connection.failed', {
      uri: sanitizedUri,
      maxAttempts,
      errorName: lastErrorName,
    });

    throw new DatabaseConnectionError(
      `Failed to connect to MongoDB after ${maxAttempts} attempt(s) (${lastErrorName})`,
      sanitizedUri,
    );
  };

  const disconnect = async (): Promise<void> => {
    if (!connection) {
      return;
    }
    const active = connection;
    connection = null;
    try {
      await active.close();
      logger.info('database.connection.closed', { uri: sanitizedUri });
    } catch (err) {
      logger.warn('database.connection.close_error', {
        uri: sanitizedUri,
        errorName: err instanceof Error ? err.name : 'CloseError',
      });
    }
  };

  const getConnection = (): Connection => {
    if (!connection || connection.readyState !== 1) {
      throw new DatabaseConnectionError('MongoDB connection is not active', sanitizedUri);
    }
    return connection;
  };

  const getReadinessProbe = (): ReadinessProbe => ({
    name: 'mongodb',
    check: async (): Promise<ReadinessCheckOutcome> => {
      if (!connection || connection.readyState !== 1 || !connection.db) {
        return {
          status: 'fail',
          detail: 'MongoDB client is disconnected',
        };
      }

      try {
        await connection.db.admin().ping();
        return {
          status: 'pass',
          detail: 'MongoDB connection and ping healthy',
        };
      } catch {
        return {
          status: 'fail',
          detail: 'MongoDB readiness ping failed',
        };
      }
    },
  });

  return {
    connect,
    disconnect,
    getConnection,
    getReadinessProbe,
    getSanitizedUri: (): string => sanitizedUri,
  };
}

export type DatabaseManager = ReturnType<typeof createDatabaseManager>;
