require('dotenv').config();
const { validateEnv, getAllowedOrigins } = require('./config/env');
const connectDB = require('./config/db');

validateEnv(); // fails fast with a clear message if .env is not configured
const app = require('./app');

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Allowed CORS origins: ${getAllowedOrigins().join(', ')}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
})();
