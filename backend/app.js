require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
mongoose.set('bufferCommands', false); // fail fast (500) instead of hanging when the DB is not connected
const { isAllowedOrigin } = require('./config/env');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const employerRoutes = require('./routes/employerRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { protect, requireRole } = require('./middleware/authMiddleware');
const { applyToJob } = require('./controllers/applicationController');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.disable('x-powered-by');
// Render (and most hosts) put a proxy in front of Express; trust one hop so req.ip, rate limiting and secure cookies use the real client.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(
  cors({
    credentials: true, // allow the browser to send the HttpOnly auth cookie from an allow-listed origin
    // Browsers must match the allow-list (any localhost port is also accepted outside production).
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  })
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
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
app.use('/api/employer', employerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
