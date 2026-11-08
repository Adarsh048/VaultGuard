import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config/env';
import { apiGeneralLimiter } from './middlewares/rateLimiter';
import { errorHandler } from './middlewares/errorHandler';

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

// Security middlewares
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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

// Error Handler
app.use(errorHandler);

export default app;

