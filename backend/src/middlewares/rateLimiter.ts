import rateLimit from 'express-rate-limit';

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

