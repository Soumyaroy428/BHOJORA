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
  paymentWebhookSecret: string;
  webhookReplayWindowSeconds: number;
  jwtAccessTtlSeconds: number;
  jwtRefreshTtlSeconds: number;
  otpTtlSeconds: number;
  otpResendCooldownSeconds: number;
  otpMaxSendPerWindow: number;
  otpWindowSeconds: number;
  otpBlockSeconds: number;
  otpMaxVerifyAttempts: number;
  loginMaxFailures: number;
  loginLockoutSeconds: number;
  recoveryTtlSeconds: number;
  authCookieSecure: boolean;
  appOriginHost: string;
  corsAllowedOrigins: readonly string[];
  logLevel: LogLevel;
  shutdownTimeoutMs: number;
}
