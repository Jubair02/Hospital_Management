import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * Fail server selection in 10s instead of the driver's 30s default. On a
 * platform that judges a deploy purely by whether a port opened, a long silent
 * stall is far worse than a fast, explicit error.
 */
const SERVER_SELECTION_TIMEOUT_MS = 10_000;

/**
 * Host and database only. A MongoDB URI carries the password in its userinfo,
 * so the raw string must never reach the log stream.
 */
const describeTarget = (uri: string): string => {
  try {
    const parsed = new URL(uri);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return 'unparseable MONGODB_URI';
  }
};

// Registered once at module load rather than inside connectDB: the caller
// retries the connection, and re-registering would stack a duplicate listener
// on every attempt until Node warns about a leak.
mongoose.connection.on('error', (err: Error) => {
  logger.error(`MongoDB connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

/**
 * Connects to MongoDB. Safe to call again after a failure — the driver's own
 * state is reset by each `connect` call.
 */
const connectDB = async (): Promise<typeof mongoose> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI is not defined. Add it to server/.env');
  }

  // Logged before the await deliberately: if the connection stalls, this line
  // is the only evidence in the log of how far the process got.
  logger.info(`Connecting to MongoDB at ${describeTarget(uri)}`);

  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  });

  logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
};

export default connectDB;
