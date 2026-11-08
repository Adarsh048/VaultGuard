import mongoose from 'mongoose';
import { config } from './env';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

/**
 * Sanitizes MongoDB connection URI for audit-safe logging
 */
function sanitizeMongoUri(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return uri.replace(/:([^:@]+)@/, ':***@');
  }
}

/**
 * Serverless-compatible MongoDB connection manager.
 * Reuses existing connections across warm serverless invocations and caches
 * in-progress connection promises to avoid connection storms.
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  // 1. Return active connection if already connected
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // 2. Cache in-progress connection promise to prevent duplicate connections during concurrent requests
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    console.log(`[Database] Connecting to MongoDB (${sanitizeMongoUri(config.mongoUri)})...`);

    cached.promise = mongoose
      .connect(config.mongoUri, opts)
      .then((m) => {
        console.log('[Database] MongoDB connection established successfully');
        return m;
      })
      .catch((err) => {
        cached.promise = null; // Clear failed promise to allow clean retries
        console.error('[Database] Failed to connect to MongoDB:', err.message || err);
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (cached.conn || mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      cached.conn = null;
      cached.promise = null;
      console.log('[Database] MongoDB disconnected');
    } catch (error) {
      console.error('[Database] Error disconnecting MongoDB:', error);
    }
  }
}

