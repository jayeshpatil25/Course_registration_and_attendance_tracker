// ============================================================
// Express Server — Production-Ready Entry Point
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./config/database');

const authRoutes = require('./routes/auth');
const registrationRoutes = require('./routes/registration');
const attendanceRoutes = require('./routes/attendance');
const lookupRoutes = require('./routes/lookup');
const adminRoutes = require('./routes/admin');

const app = express();

// ---- Security Middleware ----
app.use(helmet({ contentSecurityPolicy: false }));       // Security headers
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting — prevent brute-force and abuse
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // 30 login attempts per 15 min
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 120,                  // 120 requests per minute
  message: { error: 'Rate limit exceeded. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Body parser with size limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Request logging (simple)
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`${new Date().toISOString().slice(11,19)} ${req.method} ${req.path}`);
  }
  next();
});

// ---- Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/registration', registrationRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/lookup', lookupRoutes);
app.use('/api/admin', adminRoutes);

// ---- Health check ----
app.get('/api/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ---- 404 handler ----
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ---- Global error handler ----
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ---- Start ----
const PORT = process.env.PORT || 5000;

(async () => {
  await db.initialize();
  app.listen(PORT, () => {
    console.log(`🚀  Server running on http://localhost:${PORT}`);
    console.log(`🛡️  Security: Helmet, CORS, Rate limiting enabled`);
  });
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔌  Shutting down gracefully...');
  await db.close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await db.close();
  process.exit(0);
});
