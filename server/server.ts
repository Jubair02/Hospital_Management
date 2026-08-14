import 'dotenv/config';
import mongoose from 'mongoose';
import createApp from './app.js';
import connectDB from './config/db.js';
import logger from './utils/logger.js';

const PORT = process.env.PORT || 5000;

const start = async (): Promise<void> => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined. Add it to server/.env');
    }

    // A weak signing key undermines every other protection, so refuse to
    // boot with one in production rather than warning into a log nobody
    // reads.
    if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
      throw new Error(
        'JWT_SECRET is too short for production (use at least 32 characters; ' +
          'generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))")'
      );
    }

    if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
      throw new Error('CLIENT_URL must be set in production so CORS is not left at its default.');
    }

    await connectDB();

    // Wait for index builds so unique/partial-unique guarantees (bed
    // occupancy, active admissions, batch numbers, …) exist before the
    // first request is served.
    await Promise.all(Object.values(mongoose.connection.models).map((m) => m.init()));

    const app = createApp();

    const httpServer = app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
    });

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Stop the other process or change PORT in .env`);
      } else {
        logger.error(`HTTP server error: ${err.message}`);
      }
      process.exit(1);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
};

start();
