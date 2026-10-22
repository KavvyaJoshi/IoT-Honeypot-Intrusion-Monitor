import 'dotenv/config';
import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((value) => ['true', '1', 'yes'].includes(value));

const optionalSecret = (minLength) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || value.length >= minLength, {
      message: `must be at least ${minLength} characters`,
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  PUBLIC_BASE_URL: z.url().optional(),
  TRUST_PROXY: booleanString.default('false'),

  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/iot_honeypot'),
  MONGODB_CONNECT_RETRY_MS: z.coerce.number().int().min(1000).max(300000).default(5000),

  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  CORS_ALLOW_LAN_ORIGINS: booleanString.optional(),
  LAN_FRONTEND_PORTS: z
    .string()
    .default('5173,4173')
    .transform((value) => value.split(',').map((p) => Number(p.trim())).filter(Boolean))
    .pipe(z.array(z.int().min(1).max(65535)).max(10)),

  DEVICE_API_KEY: optionalSecret(16),
  ADMIN_TOKEN: optionalSecret(16),

  SIMULATOR_ENABLED: booleanString.optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_PUBLIC_MAX: z.coerce.number().int().min(1).default(600),
  RATE_LIMIT_DEVICE_MAX: z.coerce.number().int().min(1).default(240),
  RATE_LIMIT_SIMULATOR_MAX: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_PROBE_WINDOW_MS: z.coerce.number().int().min(1000).default(10000),
  RATE_LIMIT_PROBE_MAX: z.coerce.number().int().min(1).default(5),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

function formatIssues(issues) {
  return issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

/**
 * Parses and validates environment variables into an immutable config object.
 * Secrets are kept on the config object for server-side use only and are never
 * serialised into API responses (see settingsService.publicEnvironment()).
 */
export function loadConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${formatIssues(parsed.error.issues)}`);
  }
  const e = parsed.data;

  return Object.freeze({
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    isTest: e.NODE_ENV === 'test',
    host: e.HOST,
    port: e.PORT,
    publicBaseUrl: e.PUBLIC_BASE_URL,
    trustProxy: e.TRUST_PROXY,
    mongoUri: e.MONGODB_URI,
    mongoRetryMs: e.MONGODB_CONNECT_RETRY_MS,
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    // Also accept this laptop's own LAN address on the dashboard ports (dev default), so the
    // dashboard keeps working after the laptop's IP changes. Never accepts other hosts.
    corsAllowLanOrigins: e.CORS_ALLOW_LAN_ORIGINS ?? e.NODE_ENV === 'development',
    lanFrontendPorts: e.LAN_FRONTEND_PORTS,
    deviceApiKey: e.DEVICE_API_KEY,
    adminToken: e.ADMIN_TOKEN,
    // The simulator is on by default outside production and must be enabled explicitly in production.
    simulatorEnabled: e.SIMULATOR_ENABLED ?? e.NODE_ENV !== 'production',
    rateLimits: Object.freeze({
      windowMs: e.RATE_LIMIT_WINDOW_MS,
      publicMax: e.RATE_LIMIT_PUBLIC_MAX,
      deviceMax: e.RATE_LIMIT_DEVICE_MAX,
      simulatorMax: e.RATE_LIMIT_SIMULATOR_MAX,
      probeWindowMs: e.RATE_LIMIT_PROBE_WINDOW_MS,
      probeMax: e.RATE_LIMIT_PROBE_MAX,
    }),
    logLevel: e.LOG_LEVEL,
  });
}

export const config = loadConfig();
