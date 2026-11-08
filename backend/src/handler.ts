import { Request, Response } from 'express';
import app from './app';
import { connectDatabase } from './config/database';

/**
 * Serverless Function entry handler for VaultGuard Backend API.
 * Delegates all routing, middleware, and security controls to the existing
 * Express application in app.ts while caching database connections.
 *
 * Restores original requested paths if Vercel rewrite alters req.url.
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

  // Preserve and restore original request path if modified by Vercel rewrite
  const forwardedUrl = (req.headers['x-forwarded-url'] as string) || (req.headers['x-matched-path'] as string);
  if (forwardedUrl && (req.url === '/api/index' || req.url === '/api' || req.url === '/' || req.url === '')) {
    req.url = forwardedUrl;
  }

  // Delegate request execution to Express application
  return app(req, res);
}
