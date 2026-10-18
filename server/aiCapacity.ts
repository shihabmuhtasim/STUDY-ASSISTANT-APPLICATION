import { env } from 'cloudflare:workers';
import { ensureDatabaseSchema } from '../db/init';
import { positiveLimit, reserveLeaseSQL, reserveWindowSQL } from './capacitySQL';

export function capacityLimits() {
  return {
    perUserPerMinute: positiveLimit(env.AI_USER_RPM, 12, 120),
    hostedPerMinute: positiveLimit(env.AI_HOSTED_RPM, 30, 1_000),
    perUserConcurrent: 2,
    hostedConcurrent: positiveLimit(env.AI_HOSTED_CONCURRENCY, 8, 100),
    customConcurrent: 16,
  };
}

export async function acquireAIRequest(userId: string, channel: 'hosted' | 'custom') {
  await ensureDatabaseSchema();
  const now = Date.now(), window = Math.floor(now / 60_000), limits = capacityLimits();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ai_request_leases WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM ai_rate_windows WHERE window < ?').bind(window - 2),
  ]);
  const userWindow = await env.DB.prepare(reserveWindowSQL).bind(`user:${userId}`, window, limits.perUserPerMinute).first();
  if (!userWindow) return null;
  if (channel === 'hosted') {
    const globalWindow = await env.DB.prepare(reserveWindowSQL).bind('hosted', window, limits.hostedPerMinute).first();
    if (!globalWindow) return null;
  }
  const id = crypto.randomUUID();
  const lease = await env.DB.prepare(reserveLeaseSQL).bind(id, userId, channel, now + 180_000, userId, now, limits.perUserConcurrent, channel, now, channel === 'hosted' ? limits.hostedConcurrent : limits.customConcurrent).first();
  if (!lease) return null;
  return async () => { await env.DB.prepare('DELETE FROM ai_request_leases WHERE id = ?').bind(id).run(); };
}

export function capacityBusyResponse() {
  return Response.json({ error: 'The AI service is busy or you have sent several requests quickly. Wait a moment and try again. Your notes are safe.', code: 'AI_BUSY', retryAfter: 60 }, { status: 429, headers: { 'retry-after': '60', 'cache-control': 'no-store' } });
}
