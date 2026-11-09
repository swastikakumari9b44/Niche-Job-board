// Graceful shutdown: stop taking new connections, let in-flight requests and e-mail jobs finish (bounded), close the database.
// `deps` is injectable so it can be unit-tested without real signals.
function createShutdown({ server, disconnect, drain, log = console.log, exit = (code) => process.exit(code), timeoutMs = 10000 }) {
  let started = false;
  return async function shutdown(signal, exitCode = 0) {
    if (started) return;
    started = true;
    log(`${signal} received: shutting down gracefully`);
    const force = setTimeout(() => { log('Shutdown timed out: forcing exit'); exit(1); }, timeoutMs);
    force.unref?.();
    let code = exitCode;
    try {
      await new Promise((resolve) => { server.close(() => resolve()); server.closeIdleConnections?.(); });
      const result = await drain(Math.max(1000, timeoutMs - 3000));
      if (result && result.drained === false) log(`Shutdown: ${result.pending} background job(s) did not finish in time`);
      await disconnect();
    } catch {
      code = code || 1;
    }
    clearTimeout(force);
    exit(code);
  };
}

module.exports = { createShutdown };
