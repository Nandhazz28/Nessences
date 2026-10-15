import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIP, TEST_URI, SECRETS, configureEnv, bootApp, integrationEnabled } from './helpers/integration.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbName = configureEnv(); 
const run = (extra) => spawnSync(process.execPath, ['src/scripts/createAdmin.js'], { cwd: root, encoding: 'utf8', timeout: 60000, env: { PATH: process.env.PATH, NODE_ENV: 'test', LOG_LEVEL: 'silent', MONGODB_URI: process.env.MONGODB_URI, JWT_ACCESS_SECRET: SECRETS.access, JWT_REFRESH_SECRET: SECRETS.refresh, ...extra } });
const PW = 'Correct-Horse-Battery-9';

test('rejects a missing/invalid email or a weak/guessable password without touching the database', () => {
  for (const env of [{}, { ADMIN_EMAIL: 'not-an-email', ADMIN_PASSWORD: PW }, { ADMIN_EMAIL: 'o@example.test', ADMIN_PASSWORD: 'short' }, { ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: 'owner-owner-owner-1' }]) {
    const r = run(env); assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stderr, /admin:create:/);
  }
});

test('creates a super_admin that must change its temporary password; never prints it; never overwrites an existing account', { skip: SKIP }, async () => {
  const r = run({ ADMIN_EMAIL: 'Owner@Example.test', ADMIN_PASSWORD: PW, ADMIN_NAME: 'Store Owner' });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Created super_admin owner@example\.test/); assert.ok(!(r.stdout + r.stderr).includes(PW));
  const again = run({ ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: 'Another-Long-Password-1' });
  assert.equal(again.status, 1); assert.match(again.stderr, /already exists; nothing was changed/);
  const app = await bootApp();
  try {
    const b = app.browser(); const l = await b.post('/api/admin/auth/login', { email: 'owner@example.test', password: PW });
    assert.equal(l.status, 200); assert.equal(l.data.staff.role, 'super_admin'); assert.equal(l.data.staff.mustChangePassword, true);
    assert.equal((await b.get('/api/admin/orders')).code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await app.browser().post('/api/admin/auth/login', { email: 'owner@example.test', password: 'Another-Long-Password-1' })).status, 401, 'the existing password was not replaced');
  } finally { await app.stop(); }
});
