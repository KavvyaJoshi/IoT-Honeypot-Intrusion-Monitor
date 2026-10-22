import { defineConfig } from 'vitest/config';

// Tests use a dedicated database on the local MongoDB server (dropped at the start of each
// API test file). Override with MONGODB_URI_TEST to point somewhere else.
const testMongoUri = process.env.MONGODB_URI_TEST ?? 'mongodb://127.0.0.1:27017/iot_honeypot_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // API test files share one test database, so run files sequentially.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      MONGODB_URI: testMongoUri,
      DEVICE_API_KEY: 'test-device-key-0123456789abcdef',
      ADMIN_TOKEN: 'test-admin-token-0123456789abcdef',
      SIMULATOR_ENABLED: 'true',
      CORS_ORIGINS: 'http://localhost:5173',
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_PUBLIC_MAX: '10000',
      RATE_LIMIT_DEVICE_MAX: '10000',
      RATE_LIMIT_SIMULATOR_MAX: '10000',
      RATE_LIMIT_PROBE_WINDOW_MS: '10000',
      RATE_LIMIT_PROBE_MAX: '5',
      TRUST_PROXY: 'false',
    },
  },
});
