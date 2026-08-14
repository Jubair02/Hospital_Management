import 'dotenv/config';
import mongoose from 'mongoose';
import createApp from './app.js';
import connectDB from './config/db.js';
import logger from './utils/logger.js';

const PORT = Number(process.env.PORT) || 5000;

/**
 * Bind every interface. A PaaS routes traffic to the container's external
 * address and scans for an open port there — binding to localhost would make
 * the port invisible to it and the deploy would look dead.
 */
const HOST = process.env.HOST || '0.0.0.0';

/** Configuration that is fatal to get wrong: crash rather than serve. */
const assertConfig = (): void => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined. Add it to server/.env');
  }

  // A weak signing key undermines every other protection, so refuse to boot
  // with one in production rather than warning into a log nobody reads.
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
    throw new Error(
      'JWT_SECRET is too short for production (use at least 32 characters; ' +
        'generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))")'
    );
  }

  if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
    throw new Error('CLIENT_URL must be set in production so CORS is not left at its default.');
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined. Add it to server/.env');
  }
};

const MAX_DB_ATTEMPTS = 5;

/**
 * Connects to MongoDB, retrying with backoff. Databases are routinely
 * unreachable for a few seconds during a platform deploy, and giving up on the
 * first refusal would turn a transient blip into a failed release.
 *
 * Never throws: the HTTP server is already accepting connections by the time
 * this runs, and the health endpoint reports the outcome.
 */
const connectWithRetry = async (): Promise<void> => {
  for (let attempt = 1; attempt <= MAX_DB_ATTEMPTS; attempt += 1) {
    try {
      await connectDB();

      // Wait for index builds so unique/partial-unique guarantees (bed
      // occupancy, active admissions, batch numbers, …) exist before the first
      // request that depends on them. Models are already registered — app.js
      // is imported at the top of this file, which evaluates the whole route
      // and model graph.
      await Promise.all(Object.values(mongoose.connection.models).map((model) => model.init()));
      logger.info(
        `Database ready: ${Object.keys(mongoose.connection.models).length} models, indexes built`
      );
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`MongoDB attempt ${attempt}/${MAX_DB_ATTEMPTS} failed: ${message}`);

      if (attempt === MAX_DB_ATTEMPTS) {
        logger.error(
          'Could not reach MongoDB. The API is listening, but /api/health will report ' +
            'a 503 until a connection succeeds. Check MONGODB_URI and whether this ' +
            "host's outbound IP is allowed by the database's network access list."
        );
        return;
      }

      const backoffMs = Math.min(2000 * 2 ** (attempt - 1), 15_000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
};

const start = async (): Promise<void> => {
  try {
    assertConfig();
  } catch (err) {
    logger.error(`Failed to start server: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const app = createApp();

  /**
   * Listen BEFORE touching the database.
   *
   * The database used to be awaited first, which meant the port only opened
   * once Mongo was connected and every index had been built. A hosting
   * platform decides a deploy succeeded or timed out purely on whether
   * something is listening, so one slow DNS lookup or one missing entry in the
   * database's IP allow-list surfaced as "no open ports detected" — with no
   * error in the log, because the process was still sitting inside `await`.
   *
   * Binding first turns that class of failure into a running service whose
   * health check fails loudly and says why.
   */
  const httpServer = app.listen(PORT, HOST, () => {
    logger.info(`Server listening on ${HOST}:${PORT}`);
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use. Stop the other process or change PORT in .env`);
    } else {
      logger.error(`HTTP server error: ${err.message}`);
    }
    process.exit(1);
  });

  // Platforms send SIGTERM on redeploy; finish in-flight requests and close the
  // database cleanly instead of dropping both.
  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down`);
    httpServer.close(() => {
      void mongoose.connection.close(false).then(() => process.exit(0));
    });
    // Never hang a deploy waiting on a stuck socket.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await connectWithRetry();
};

void start();
