#!/usr/bin/env node
/*
 * Manual bootstrap for the first admin account.
 *
 *   npm run create-admin                      (interactive; password is hidden while typing)
 *   npm run create-admin -- --promote         (upgrade an existing account instead of creating one)
 *
 * Non-interactive (CI / hosting shell): pass ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD as environment
 * variables for that single command. Do not store them in .env or commit them anywhere.
 * It uses MONGO_URI from the environment / .env, so it runs against whichever database that points to.
 */
require('dotenv').config();
const readline = require('readline');
const mongoose = require('mongoose');
const { createAdminAccount } = require('../services/adminBootstrap');

function prompt(rl, question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    rl.muted = false;
    rl.question(question, (answer) => { rl.muted = false; if (hidden) process.stdout.write('\n'); resolve(answer); });
    rl.muted = hidden;
  });
}

(async () => {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI is not set. Put it in backend/.env first.'); process.exit(1); }
  const promote = process.argv.includes('--promote');
  let { ADMIN_NAME: name, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = process.env;

  if (!name || !email || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s) => { if (!rl.muted) write(s); };
    name = name || (await prompt(rl, 'Admin name: '));
    email = email || (await prompt(rl, 'Admin email: '));
    password = password || (await prompt(rl, 'Admin password (min 12 chars, hidden): ', { hidden: true }));
    rl.close();
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const { user, promoted } = await createAdminAccount({ name, email, password }, { promoteExisting: promote });
    console.log(`${promoted ? 'Promoted' : 'Created'} admin account: ${user.email}`);
  } catch (err) {
    console.error(`Could not create admin: ${err.issues ? err.issues.map((i) => i.message).join('; ') : err.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();
