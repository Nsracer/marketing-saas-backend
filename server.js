import dotenv from 'dotenv';
// Load environment variables FIRST before any other imports
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import healthRoutes from './routes/healthRoutes.js';
import googleAuthRoutes from './routes/googleAuthRoutes.js';
import facebookAuthRoutes from './routes/facebookAuthRoutes.js';
import facebookMetricsRoutes from './routes/facebookMetricsRoutes.js';
import facebookMetricsRoutesV2 from './routes/facebookMetricsRoutesV2.js';
import facebookDevRoutes from './routes/facebookDevRoutes.js';
import instagramAuthRoutes from './routes/instagramAuthRoutes.js';
import instagramMetricsRoutes from './routes/instagramMetricsRoutes.js';
import instagramMetricsRoutesV2 from './routes/instagramMetricsRoutesV2.js';
import instagramDevRoutes from './routes/instagramDevRoutes.js';
import linkedinMetricsRoutes from './routes/linkedinMetricsRoutes.js';
// import linkedinAuthRoutes from './routes/linkedinAuthRoutes.js'; // Commented out - missing LinkedIn credentials
import linkedinMetricsRoutesV2 from './routes/linkedinMetricsRoutesV2.js';
import linkedinAuthRoutes from './routes/linkedinAuthRoutes.js';
import lighthouseRoutes from './routes/lighthouseRoutes.js';
import userAnalyticsRoutes from './routes/userAnalyticsRoutes.js';
import searchConsoleRoutes from './routes/searchConsoleRoutes.js';
import trafficRoutes from './routes/trafficRoutes.js';
import competitorRoutes from './routes/competitorRoutes.js';
import debugRoutes from './routes/debugRoutes.js';
import pdfRoutes from './routes/pdfRoutes.js';
import socialReportRoutes from './routes/socialReportRoutes.js';
import socialStatusRoutes from './routes/socialStatusRoutes.js';
import businessInfoRoutes from './routes/businessInfoRoutes.js';
import businessCompetitorsRoutes from './routes/businessCompetitorsRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import aiInsightsRoutes from './routes/aiInsightsRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import healthScoreRoutes from './routes/healthScoreRoutes.js';
import quickWinsRoutes from './routes/quickWinsRoutes.js';
import enhancedCompetitorRoutes from './routes/enhancedCompetitorRoutes.js';
import socialConnectionRoutes from './routes/socialConnectionRoutes.js';
import stripeWebhookRoutes from './routes/stripeWebhookRoutes.js';
import stripeTestRoutes from './routes/stripeTestRoutes.js';
import userRoutes from './routes/userRoutes.js';
import planChangeRoutes from './routes/planChangeRoutes.js';
import refreshAnalysisRoutes from './routes/refreshAnalysisRoutes.js';

const app = express();
const PORT = process.env.PORT || 3010;

// Environment validation
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('⚠️ Running in development mode with missing env vars');
  }
}

// Performance optimizations
app.set('trust proxy', 1);

// CORS configuration - supports both development and production
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:3002', 'http://localhost:3000', 'https://saas-frontend-o2cx.onrender.com']
  : ['http://localhost:3002', 'http://localhost:3000', 'https://saas-frontend-o2cx.onrender.com'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting - prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 5000, // Limit each IP to 100 requests per windowMs in production
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// Middleware with size limits to prevent memory issues
app.use(helmet());

// Skip JSON parsing for Stripe webhook (needs raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
}); // Limit request size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout middleware (prevent hanging requests)
app.use((req, res, next) => {
  req.setTimeout(120000); // 2 minutes max
  res.setTimeout(120000);
  next();
});

// Serve static files from public folder (for test pages)
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/public', express.static(path.join(__dirname, 'public')));

// Memory monitoring (log warnings)
setInterval(() => {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);

  if (heapUsedMB > 400) { // Warn if using > 400MB
    console.warn(`⚠️ High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`);
  }
}, 30000); // Check every 30 seconds

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/user', userRoutes);
app.use('/api', googleAuthRoutes);
app.use('/api', facebookAuthRoutes);
app.use('/api/facebook', facebookMetricsRoutes);
app.use('/api/facebook/v2', facebookMetricsRoutesV2); // NEW: Official API only (30 days)
app.use('/api/facebook/dev', facebookDevRoutes);
app.use('/api', instagramAuthRoutes);
app.use('/api/instagram', instagramMetricsRoutes);
app.use('/api/instagram/v2', instagramMetricsRoutesV2); // NEW: Official API only (30 days)
app.use('/api/instagram/dev', instagramDevRoutes);
// DISABLED: Old V1 LinkedIn route - use /api/linkedin/v2 only (has rate limit protection)
// app.use('/api/linkedin', linkedinMetricsRoutes);
// app.use('/api/auth/linkedin', linkedinAuthRoutes); // Commented out - missing LinkedIn credentials
app.use('/api/linkedin/v2', linkedinMetricsRoutesV2); // NEW: Apify + Official API with rate limit protection
app.use('/api/auth/linkedin', linkedinAuthRoutes);
app.use('/api', lighthouseRoutes);
app.use('/api', userAnalyticsRoutes);
app.use('/api', searchConsoleRoutes);
app.use('/api', trafficRoutes);
app.use('/api/competitor', competitorRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/social/report', socialReportRoutes);
app.use('/api/social', socialStatusRoutes);
app.use('/api/business-info', businessInfoRoutes);
app.use('/api/business-competitors', businessCompetitorsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/ai-insights', aiInsightsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api', healthScoreRoutes);
app.use('/api/quickwins', quickWinsRoutes);
app.use('/api/enhanced-competitor', enhancedCompetitorRoutes);
app.use('/api/social-connections', socialConnectionRoutes);
app.use('/api/stripe', stripeWebhookRoutes);
app.use('/api/stripe-test', stripeTestRoutes); // Test endpoints (dev only)
app.use('/api/plan', planChangeRoutes); // Plan upgrade and cache management
app.use('/api', refreshAnalysisRoutes); // Refresh analysis - clear all caches

// Health check endpoint (for monitoring and load balancers)
app.get('/health', (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    }
  };

  res.status(200).json(healthcheck);
});

// Legacy status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'SEO Health Score API'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 SEO Health Score API running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📍 Health endpoint: http://localhost:${PORT}/health`);
  console.log(`🔐 Google Auth: http://localhost:${PORT}/api/auth/google`);
  console.log(`📘 Facebook Auth: http://localhost:${PORT}/api/auth/facebook`);
  console.log(`📸 Instagram Auth: http://localhost:${PORT}/api/auth/instagram`);
  console.log(`📸 Instagram Metrics: http://localhost:${PORT}/api/instagram`);
  console.log(`⚡ Lighthouse: http://localhost:${PORT}/api/lighthouse`);
  console.log(`📈 Analytics: http://localhost:${PORT}/api/analytics`);
  console.log(`🔍 Search Console: http://localhost:${PORT}/api/search-console`);
  console.log(`📊 Traffic: http://localhost:${PORT}/api/traffic`);
  console.log(`🏆 Competitor: http://localhost:${PORT}/api/competitor`);
  console.log(`📱 Facebook Metrics: http://localhost:${PORT}/api/facebook`);
  console.log(`🏢 Business Info: http://localhost:${PORT}/api/business-info`);
  console.log(`🚀 Quick Wins: http://localhost:${PORT}/api/quickwins`);
});

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  server.close(() => {
    console.log('✅ HTTP server closed');

    // Close database connections, cleanup resources, etc.
    console.log('✅ Cleanup completed');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
