// Provisioning only: prints new passwords and hashes. Never used by application logging.
const crypto = require('crypto');
const accounts = {};
for (const role of ['admin', 'reviewer']) {
  const password = crypto.randomBytes(15).toString('base64url');
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
  accounts[role] = { password, hash: `scrypt:32768:8:1:${salt}:${digest}` };
}
process.stdout.write(JSON.stringify(accounts));
