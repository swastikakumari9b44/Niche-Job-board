require('dotenv').config();
const { validateEnv, getAllowedOrigins } = require('./config/env');
const connectDB = require('./config/db');

// Print a startup failure in a way that is never lost, then let the process end by itself
// (calling process.exit() right after console.error can drop the message on Windows terminals).
function fail(title, err, hints = []) {
  console.error(`\n[startup error] ${title}`);
  if (err?.message) console.error(`  Reason: ${err.message}`);
  for (const h of hints) console.error(`  - ${h}`);
  console.error('');
  process.exitCode = 1;
}

function mongoHints(err) {
  const m = `${err?.name} ${err?.message}`;
  if (/bad auth|authentication failed/i.test(m)) return ['Wrong database username or password in MONGO_URI. Special characters in the password must be URL-encoded (e.g. @ becomes %40).'];
  if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(m)) return ['DNS lookup failed: check your internet/VPN, or the cluster host in MONGO_URI. If your network blocks SRV lookups, use the "standard connection string" from Atlas (mongodb://...).'];
  if (/ServerSelection|timed out|ECONNREFUSED|ETIMEDOUT/i.test(m)) return [
    'Atlas could not be reached. Most common cause: your current IP is not allowed. In Atlas open Network Access and add your current IP address (or 0.0.0.0/0 for development).',
    'Also check that the cluster is not paused and that your internet/VPN/firewall allows port 27017.',
  ];
  return ['Check MONGO_URI in backend/.env.'];
}

process.on('unhandledRejection', (reason) => fail('Unhandled error', reason instanceof Error ? reason : new Error(String(reason))));

try {
  validateEnv(); // fails fast with a clear message if .env is not configured
} catch (err) {
  fail('Environment is not configured', err, ['Open backend/.env and make sure MONGO_URI and JWT_SECRET are set (see .env.example).']);
  return;
}

const app = require('./app');
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
  } catch (err) {
    return fail('Could not connect to MongoDB', err, mongoHints(err));
  }
  const server = app.listen(PORT, (err) => {
    if (err) return; // Express 5 passes listen errors here too; they are reported by the 'error' handler below
    console.log(`Server running on port ${PORT}`);
    console.log(`Allowed CORS origins: ${getAllowedOrigins().join(', ')}`);
  });
  server.on('error', (err) => {
    fail(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use` : 'Server error', err,
      err.code === 'EADDRINUSE' ? [`Another copy of the backend (or another program) is using port ${PORT}. Close the other terminal, or change PORT in .env.`] : []);
    mongoose_close();
  });
})();

function mongoose_close() { require('mongoose').disconnect().catch(() => {}); }
