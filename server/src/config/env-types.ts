export type NodeEnvironment = 'development' | 'test' | 'production';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  host: string;
  serviceName: string;
  serviceVersion: string;
  appTimezone: string;
  defaultCityCode: string;
  defaultCurrency: 'INR';
  mongodbUri: string;
  mongodbServerSelectionTimeoutMs: number;
  mongodbConnectTimeoutMs: number;
  mongodbMaxPoolSize: number;
  mongodbAutoIndex: boolean;
  redisUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  corsAllowedOrigins: readonly string[];
  logLevel: LogLevel;
  shutdownTimeoutMs: number;
}
