import { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/api/auth/login', '/api/health']);

/**
 * CSRF Protection Middleware for cookie-authenticated state-changing requests
 * Uses Double-Submit Cookie validation pattern.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Allow safe HTTP methods (GET, HEAD, OPTIONS)
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Exempt unauthenticated public endpoints
  if (EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  // If request uses Bearer token authorization header (non-cookie / programmatic test client),
  // custom headers cannot be forged via cross-origin HTML form submission
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }

  // If request is authenticated using cookie, enforce CSRF token validation
  if (req.cookies?.vaultguard_token) {
    const cookieCsrfToken = req.cookies?.vaultguard_csrf;
    const headerCsrfToken =
      req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];

    if (!cookieCsrfToken || !headerCsrfToken || cookieCsrfToken !== headerCsrfToken) {
      res.status(403).json({
        success: false,
        message: 'CSRF validation failed: Missing or invalid CSRF protection token.',
      });
      return;
    }
  }

  next();
}

