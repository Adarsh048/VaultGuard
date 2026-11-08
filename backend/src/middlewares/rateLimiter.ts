import rateLimit from 'express-rate-limit';

/**
 * RATE LIMITING ARCHITECTURE IN SERVERLESS EXECUTION:
 *
 * In standard persistent server environments, express-rate-limit's in-memory store
 * tracks request frequencies across all clients connecting to that instance.
 *
 * In serverless environments (e.g. Vercel Functions / AWS Lambda):
 * 1. Each concurrent execution container maintains its own isolated in-memory counter.
 * 2. Idle containers freeze or terminate, resetting local in-memory counters.
 * 3. Consequently, in-memory rate limiting functions as an INTRA-CONTAINER CIRCUIT BREAKER,
 *    preventing single-container CPU/memory abuse or rapid local brute-force bursts.
 * 4. For global rate limiting across distributed, dynamically auto-scaled serverless instances,
 *    traffic should be gated at the edge (e.g. Vercel Firewall / WAF custom rules or Cloudflare Rate Limiting)
 *    or backed by an external distributed cache store (e.g. Upstash Redis / Redis Cloud).
 */

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const credentialRetrievalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 requests per window
  message: {
    success: false,
    message: 'Too many credential retrieval requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiGeneralLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

