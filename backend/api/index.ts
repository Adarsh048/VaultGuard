import { Request, Response } from 'express';
import app from '../src/app';
import { connectDatabase } from '../src/config/database';

/**
 * Vercel Serverless Function entry point for VaultGuard Backend API.
 * Delegates all routing, middleware, and security controls to the existing
 * Express application in src/app.ts while caching database connections.
 */
export default async function handler(req: Request, res: Response) {
  try {
    // Ensure active MongoDB connection across warm serverless invocations
    await connectDatabase();
  } catch (dbError: any) {
    console.error('[Vercel Serverless] Failed to connect to MongoDB cluster:', dbError.message || dbError);
    return res.status(503).json({
      success: false,
      message: 'Database service unavailable. Failed to establish connection to database cluster.',
    });
  }

  // Delegate request execution to Express application
  return app(req, res);
}
