process.env.NODE_ENV = 'test';
process.env.FORCE_RATE_LIMIT = '1';
const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createAuthLimiter } = require('../middleware/rateLimiters');

test('auth limiter returns 429 JSON after the limit', async () => {
  const app = express();
  app.post('/login', createAuthLimiter(3), (_req, res) => res.status(401).json({ ok: false }));
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const url = `http://127.0.0.1:${server.address().port}/login`;
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await fetch(url, { method: 'POST' })).status);
  server.close();
  assert.deepStrictEqual(codes, [401, 401, 401, 429, 429]);
});
