import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { capacitySchema, reserveWindowSQL, reserveLeaseSQL, positiveLimit } from './capacitySQL.ts';

test('Shared SQL limits bound a 200-request burst across simulated users', () => {
  const db = new DatabaseSync(':memory:'); capacitySchema.forEach(sql => db.exec(sql));
  const rate = db.prepare(reserveWindowSQL), lease = db.prepare(reserveLeaseSQL);
  let admitted = 0;
  for (let i = 0; i < 200; i++) {
    const user = `synthetic-${i}`;
    if (!rate.get('hosted', 1, 30)) continue;
    if (lease.get(String(i), user, 'hosted', 180_000, user, 0, 2, 'hosted', 0, 8)) admitted++;
  }
  assert.equal(admitted, 8);
  assert.equal(db.prepare('SELECT used FROM ai_rate_windows').get()?.used, 30);
  db.exec('DELETE FROM ai_request_leases');
  assert.ok(lease.get('first', 'same-user', 'custom', 180_000, 'same-user', 0, 2, 'custom', 0, 16));
  assert.ok(lease.get('second', 'same-user', 'custom', 180_000, 'same-user', 0, 2, 'custom', 0, 16));
  assert.equal(lease.get('third', 'same-user', 'hosted', 180_000, 'same-user', 0, 2, 'hosted', 0, 8), undefined);
  assert.ok(lease.get('after-expiry', 'same-user', 'hosted', 400_000, 'same-user', 200_000, 2, 'hosted', 200_000, 8));
  db.close();
});

test('Request windows reset and invalid configuration cannot disable protections', () => {
  const db = new DatabaseSync(':memory:'); capacitySchema.forEach(sql => db.exec(sql)); const rate = db.prepare(reserveWindowSQL);
  for (let i = 0; i < 12; i++) assert.ok(rate.get('user', 1, 12));
  assert.equal(rate.get('user', 1, 12), undefined); assert.ok(rate.get('user', 2, 12));
  for (const value of ['0', '-1', 'NaN', '999999']) assert.equal(positiveLimit(value, 12, 120), 12);
  db.close();
});
