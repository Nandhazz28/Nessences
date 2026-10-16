import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const blueprint = YAML.parse(fs.readFileSync(path.join(root, 'render.yaml'), 'utf8'));
const svc = blueprint.services[0];
const envKeys = Object.fromEntries(svc.envVars.map((e) => [e.key, e]));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'server/package.json'), 'utf8'));

test('render.yaml is valid YAML describing one Node web service rooted at server/', () => {
  assert.equal(blueprint.services.length, 1);
  assert.equal(svc.type, 'web'); assert.equal(svc.runtime, 'node'); assert.equal(svc.rootDir, 'server');
  assert.ok(fs.existsSync(path.join(root, svc.rootDir, 'package-lock.json')), 'npm ci needs the lockfile');
});

test('build, start and pre-deploy commands exist as npm scripts; production dependencies only', () => {
  assert.equal(svc.buildCommand, 'npm ci --omit=dev'); assert.equal(svc.startCommand, 'npm start'); assert.equal(svc.preDeployCommand, 'npm run indexes');
  assert.ok(pkg.scripts.start && pkg.scripts.indexes);
  const dev = Object.keys(pkg.devDependencies ?? {});
  const used = new Set(); for (const f of fs.readdirSync(path.join(root, 'server/src'), { recursive: true }).filter((n) => n.endsWith('.js'))) for (const m of fs.readFileSync(path.join(root, 'server/src', f), 'utf8').matchAll(/from '([^./][^']*)'/g)) used.add(m[1].split('/')[0].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0]);
  for (const d of dev) assert.ok(!used.has(d), `dev dependency ${d} is imported by runtime code`);
});

test('health check path is the liveness/startup gate that exists in the app and is not the DB-coupled one', () => {
  assert.equal(svc.healthCheckPath, '/health');
  const app = fs.readFileSync(path.join(root, 'server/src/app.js'), 'utf8');
  assert.match(app, /app\.get\(['"]\/health['"]/); assert.match(app, /app\.get\(['"]\/ready['"]/);
});

test('Node version is pinned and satisfies package.json engines', () => {
  const v = envKeys.NODE_VERSION.value; assert.match(v, /^\d+\.\d+\.\d+$/);
  const min = Number((pkg.engines.node.match(/(\d+)/) ?? [])[1]); assert.ok(Number(v.split('.')[0]) >= min, `${v} vs engines ${pkg.engines.node}`);
});

test('no secret is committed: every credential is sync:false or generated; PORT is left to Render', () => {
  for (const k of ['MONGODB_URI', 'BREVO_API_KEY', 'PAYMENT_KEY', 'PAYMENT_SECRET', 'PAYMENT_WEBHOOK_SECRET', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_CLOUD_NAME']) { assert.equal(envKeys[k]?.sync, false, k); assert.equal(envKeys[k].value, undefined, k); }
  for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) { assert.equal(envKeys[k].generateValue, true, k); assert.equal(envKeys[k].value, undefined, k); }
  assert.ok(!('PORT' in envKeys)); assert.equal(envKeys.NODE_ENV.value, 'production');
  assert.ok(!/localhost|127\.0\.0\.1|onrender\.com|vercel\.app|mongodb(\+srv)?:\/\//.test(fs.readFileSync(path.join(root, 'render.yaml'), 'utf8').replace(/#.*$/gm, '')), 'no hard-coded hosts or connection strings');
});

test('every variable the production schema REQUIRES is provided by the blueprint (or has a documented default)', async () => {
  const supplied = Object.fromEntries(svc.envVars.map((e) => [e.key, e.sync === false ? (e.key === 'MONGODB_URI' ? 'mongodb+srv://u:p@c.mongodb.net/n' : e.key.endsWith('_URL') ? 'https://x.example.com' : e.key === 'BREVO_SENDER_EMAIL' ? 'no-reply@example.com' : e.key === 'COOKIE_SAMESITE' ? 'lax' : e.key === 'ALLOWED_ORIGINS' ? '' : 'placeholder-value') : e.generateValue ? 'g'.repeat(43) : String(e.value)]));
  const { parseEnv } = await import('../src/config/envSchema.js');
  const r = parseEnv(supplied);
  assert.equal(r.ok, true, JSON.stringify(r.errors ?? r.issues));
});

test('the sitemap/robots function and the API agree on which routes are private', async () => {
  const client = await import('../../client/api/seo.js'); const { PRIVATE_PATHS } = await import('../src/services/seoService.js');
  assert.deepEqual(client.PRIVATE_PATHS, PRIVATE_PATHS);
});

test('.gitignore keeps real environment files out of the repository, and none are present', () => {
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8'); assert.match(gi, /^\.env$/m); assert.match(gi, /^\.env\.\*$/m); assert.match(gi, /^!\.env\.example$/m);
  const found = fs.readdirSync(root, { recursive: true }).filter((f) => !String(f).includes('node_modules') && /(^|\/)\.env(\.(?!example)[\w.-]+)?$/.test(String(f)));
  assert.deepEqual(found, []);
});
