require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { getAllowedOrigins } = require('./config/env');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const { protect, requireRole } = require('./middleware/authMiddleware');
const { applyToJob } = require('./controllers/applicationController');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.disable('x-powered-by');
app.use(
  cors({
    origin(origin, cb) {
      const allowed = getAllowedOrigins();
      // No Origin header (curl, server-to-server) is allowed; browsers must match the allow-list.
      if (!origin || allowed.includes(origin)) return cb(null, true);
      cb(null, false);
    },
  })
);
app.use(express.json({ limit: '100kb' }));
// NOTE: /uploads is intentionally NOT served statically.

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

app.get('/', (_req, res) => res.json({ success: true, message: 'Niche Job Board API' }));
app.get('/api/health', (_req, res) => {
  const state = mongoose.connection.readyState;
  res.json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    database: { connected: state === 1, state: DB_STATES[state] || 'unknown' },
  });
});

app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.post('/api/apply', protect, requireRole('candidate'), applyToJob); // backward-compatible alias
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
