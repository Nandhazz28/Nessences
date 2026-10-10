import test from 'node:test';
import assert from 'node:assert/strict';
process.env.MONGODB_URI ??= 'mongodb://x';
import { listQuerySchema } from '../src/services/catalogService.js';

test('slugs filter parses to a bounded array, for "recently viewed"', () => {
  const q = listQuerySchema.parse({ slugs: 'a-coat, b-shirt ,,c' });
  assert.deepEqual(q.slugs, ['a-coat', 'b-shirt', 'c']);
  assert.equal(listQuerySchema.parse({ slugs: Array.from({ length: 40 }, (_, i) => 's' + i).join(',').slice(0, 290) }).slugs.length <= 20, true);
});
test('absent slugs leaves the filter off; limit stays capped at 48', () => {
  assert.equal(listQuerySchema.parse({}).slugs, undefined);
  assert.throws(() => listQuerySchema.parse({ limit: 500 }));
});
