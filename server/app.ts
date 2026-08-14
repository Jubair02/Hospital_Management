import express, { type Express, type Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import logger, { httpLogSerializers } from './utils/logger.js';
import requestId from './middleware/requestId.js';
import auditContext from './middleware/audit.js';
import { countRequest, countResponse } from './utils/metrics.js';
import { createLoginLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import patientRoutes from './routes/patientRoutes.js';
import portalRoutes from './routes/portalRoutes.js';
import departmentRoutes from './routes/departmentRoutes.js';
import doctorRoutes from './routes/doctorRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import consultationRoutes from './routes/consultationRoutes.js';
import pharmacyRoutes from './routes/pharmacyRoutes.js';
import laboratoryRoutes from './routes/laboratoryRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import inpatientRoutes from './routes/inpatientRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import reportsRoutes from './routes/reportsRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

/**
 * Builds the Express app without connecting to the database or
 * listening on a port — server.ts does that for production, and the
 * test suite mounts this app directly with supertest.
 */
const createApp = (): Express => {
  const app = express();

  // Behind a reverse proxy (nginx, a PaaS), set TRUST_PROXY so rate
  // limiting keys on the real client IP instead of the proxy's.
  if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== 'false') {
    const value = process.env.TRUST_PROXY;
    app.set('trust proxy', Number.isNaN(Number(value)) ? value : Number(value));
  }

  // --- Correlation + structured request logging ---
  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).id,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customProps: (req) => ({
        userId: (req as Request).user?._id?.toString(),
      }),
      // Allow-list serializers: credentials never reach the log stream.
      serializers: httpLogSerializers,
    })
  );

  // --- Security & parsing middleware ---
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10kb' }));

  // Audit helper (req.audit) and the health-dashboard counters.
  app.use(auditContext);
  app.use((_req, res, next) => {
    countRequest();
    res.on('finish', () => countResponse(res.statusCode));
    next();
  });

  // --- Health check ---
  // Reports the database, not just the process. This endpoint is what a
  // platform health check polls, and one that returns 200 while MongoDB is
  // unreachable converts a precise failure into a mystery: the service looks
  // healthy and every real request 500s.
  app.get('/api/health', (_req, res) => {
    // Keyed, not a tuple: mongoose numbers "uninitialized" 99, so the states
    // are not a contiguous range.
    const STATES: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
      99: 'uninitialized',
    };
    const state = STATES[mongoose.connection.readyState] ?? 'unknown';
    const ready = mongoose.connection.readyState === 1;

    res.status(ready ? 200 : 503).json({
      success: ready,
      message: ready ? 'API is running' : `API is running but the database is ${state}`,
      data: { uptime: process.uptime(), database: state },
    });
  });

  // --- Routes ---
  app.use('/api/auth/login', createLoginLimiter());
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/patient', portalRoutes); // patient self-service portal
  app.use('/api/departments', departmentRoutes);
  app.use('/api/doctors', doctorRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/consultations', consultationRoutes);
  app.use('/api/pharmacy', pharmacyRoutes);
  app.use('/api/laboratory', laboratoryRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/inpatient', inpatientRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/reports', reportsRoutes);

  // --- 404 + central error handling ---
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export default createApp;
