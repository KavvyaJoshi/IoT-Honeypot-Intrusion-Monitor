import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { corsOriginOption } from './config/cors.js';
import { config } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiters } from './middleware/rateLimiters.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createApiRouter } from './routes/index.js';

export const MAX_BODY_SIZE = '8kb';

/**
 * Builds the Express application. Kept separate from server.js so tests can exercise the
 * HTTP API with supertest without opening a port or connecting Socket.IO.
 */
export function createApp({ rateLimits = config.rateLimits } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: corsOriginOption(config),
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(requestLogger);
  app.use(express.json({ limit: MAX_BODY_SIZE, strict: true }));

  app.use('/api', createApiRouter(createRateLimiters(rateLimits)));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
