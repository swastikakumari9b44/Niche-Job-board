const mongoose = require('mongoose');
const { logError, logWarn } = require('../utils/logger');

let listening = false;

// Reusable connection function. Reads the connection string from MONGO_URI only.
// After the first successful connection the driver reconnects by itself; we only log (sanitized) so an Atlas outage is visible.
async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set.');
  if (!listening) {
    listening = true;
    mongoose.connection.on('disconnected', () => logWarn('MongoDB disconnected; the driver will keep trying to reconnect'));
    mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
    mongoose.connection.on('error', (err) => logError('MongoDB connection error', err));
  }
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, socketTimeoutMS: 45000, maxPoolSize: 10 });
  console.log(`MongoDB connected: ${conn.connection.host}`);
  return conn;
}

module.exports = connectDB;
