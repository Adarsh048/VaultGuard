import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config/env';
import { connectDatabase } from './config/database';
import { apiGeneralLimiter } from './middlewares/rateLimiter';
import { errorHandler } from './middlewares/errorHandler';
import { csrfProtection } from './middlewares/csrf';

import authRoutes from './routes/auth.routes';
import accountsRoutes from './routes/accounts.routes';
import credentialsRoutes from './routes/credentials.routes';
import requestsRoutes from './routes/requests.routes';
import rotationRoutes from './routes/rotation.routes';
import monitoringRoutes from './routes/monitoring.routes';
import incidentsRoutes from './routes/incidents.routes';
import auditRoutes from './routes/audit.routes';
import dashboardRoutes from './routes/dashboard.routes';

const app = express();

// Configure trust proxy for Vercel edge reverse proxy (trusts immediate upstream hop)
app.set('trust proxy', 1);

// Security headers with Helmet
app.use(helmet());

// CORS configuration supporting single origin or comma-separated origin list
const allowedOrigins = config.corsOrigin
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''));

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Allow requests with no origin (e.g. same-origin serverless rewrites, curl, health probes)
      if (!requestOrigin) return callback(null, true);

      const normalizedOrigin = requestOrigin.replace(/\/$/, '');
      if (
        allowedOrigins.includes(normalizedOrigin) ||
        (!config.isProduction && (normalizedOrigin.includes('localhost') || normalizedOrigin.includes('127.0.0.1')))
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked: Origin '${requestOrigin}' is not permitted.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-CSRF-Token',
      'X-XSRF-Token',
    ],
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Ensure database connection is active (handles serverless warm/cold invocations)
app.use(async (req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (err: any) {
    res.status(503).json({
      success: false,
      message: 'Database service unavailable. Failed to connect to database cluster.',
    });
  }
});

// Apply CSRF protection for state-changing requests
app.use(csrfProtection);

if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Rate limiting on API routes
app.use('/api', apiGeneralLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'VaultGuard PAM API',
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/accounts', credentialsRoutes); // Handles POST /api/accounts/:id/retrieve
app.use('/api/requests', requestsRoutes);
app.use('/api/rotation', rotationRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Centralized Error Handler
app.use(errorHandler);

export default app;
