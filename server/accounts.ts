import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { ensureDatabaseSchema } from '../db/init';
import { aiUsageEvents, users } from '../db/schema';
import {
  ADMIN_MONTHLY_AI_LIMIT,
  FREE_MONTHLY_AI_LIMIT,
  PRO_MONTHLY_AI_LIMIT,
  nextMonthlyReset,
  remainingPercentage,
} from './aiUsage';
import type { VerifiedFirebaseUser } from './firebaseUser';

function usagePeriod(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function adminEmails() {
  return new Set((env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
}

function accessLimit(plan: string, role: string) {
  if (role === 'admin') return ADMIN_MONTHLY_AI_LIMIT;
  return plan === 'pro' ? PRO_MONTHLY_AI_LIMIT : FREE_MONTHLY_AI_LIMIT;
}

export async function ensureUser(user: VerifiedFirebaseUser) {
  await ensureDatabaseSchema();
  const db = getDb();
  const now = Date.now();
  const isAdmin = adminEmails().has(user.email.toLowerCase());

  await db.insert(users).values({
    id: user.uid,
    email: user.email,
    displayName: user.displayName,
    plan: isAdmin ? 'pro' : 'free',
    role: isAdmin ? 'admin' : 'user',
    createdAt: now,
    lastSeenAt: now,
  }).onConflictDoUpdate({
    target: users.id,
    set: {
      email: user.email,
      displayName: user.displayName,
      ...(isAdmin ? { plan: 'pro' as const, role: 'admin' as const } : {}),
      lastSeenAt: now,
    },
  });

  return db.query.users.findFirst({ where: eq(users.id, user.uid) });
}

async function currentUsage(userId: string) {
  const result = await env.DB.prepare(
    'SELECT used FROM ai_usage_counters WHERE user_id = ? AND period = ?',
  ).bind(userId, usagePeriod()).first<{ used: number }>();
  return Number(result?.used) || 0;
}

export async function getAccountSummary(user: VerifiedFirebaseUser) {
  const record = await ensureUser(user);
  const used = await currentUsage(user.uid);
  const plan = record?.plan === 'pro' ? 'pro' : 'free';
  const role = record?.role === 'admin' ? 'admin' : 'user';
  const limit = accessLimit(plan, role);
  return {
    userId: user.uid,
    email: user.email,
    displayName: user.displayName,
    plan,
    role,
    aiUsage: used,
    aiLimit: limit,
    aiRemaining: Math.max(0, limit - used),
    aiRemainingPercent: remainingPercentage(limit, Math.max(0, limit - used)),
    aiResetAt: nextMonthlyReset(),
  };
}

export async function reserveAIAllowance(user: VerifiedFirebaseUser, units: number) {
  const account = await getAccountSummary(user);
  const reservedUnits = Math.max(1, Math.min(Math.ceil(units), account.aiRemaining));
  const result = await env.DB.prepare(`
    INSERT INTO ai_usage_counters (user_id, period, used, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, period) DO UPDATE SET
      used = used + excluded.used,
      updated_at = excluded.updated_at
    WHERE used + excluded.used <= ?
    RETURNING used
  `).bind(user.uid, usagePeriod(), reservedUnits, Date.now(), account.aiLimit).first<{ used: number }>();
  const used = Number(result?.used);
  return {
    allowed: Number.isFinite(used),
    account,
    reservedUnits,
    remaining: Number.isFinite(used) ? Math.max(0, account.aiLimit - used) : 0,
  };
}

export async function settleAIAllowance(userId: string, reservedUnits: number, actualUnits: number, limit: number) {
  const delta = Math.ceil(actualUnits) - Math.ceil(reservedUnits);
  if (delta === 0) return currentUsage(userId);
  const result = await env.DB.prepare(`
    UPDATE ai_usage_counters
    SET used = MIN(?, MAX(0, used + ?)), updated_at = ?
    WHERE user_id = ? AND period = ?
    RETURNING used
  `).bind(limit, delta, Date.now(), userId, usagePeriod()).first<{ used: number }>();
  return Number(result?.used) || 0;
}

export async function releaseAIAllowance(userId: string, reservedUnits: number) {
  await env.DB.prepare(`
    UPDATE ai_usage_counters
    SET used = MAX(0, used - ?), updated_at = ?
    WHERE user_id = ? AND period = ?
  `).bind(Math.max(1, Math.ceil(reservedUnits)), Date.now(), userId, usagePeriod()).run();
}

export async function recordAIUsage(input: {
  userId: string;
  provider: string;
  model: string;
  requestType: 'text' | 'vision';
  inputCharacters: number;
  outputCharacters: number;
}) {
  await getDb().insert(aiUsageEvents).values({
    id: crypto.randomUUID(),
    ...input,
    createdAt: Date.now(),
  });
}

export async function recordAIRequestEvent(input: {
  userId: string;
  provider: string;
  model: string;
  status: 'success' | 'fallback' | 'error';
  errorCode?: string;
  latencyMs: number;
  usageUnits: number;
}) {
  await ensureDatabaseSchema();
  await env.DB.prepare(`
    INSERT INTO ai_request_events
      (id, user_id, provider, model, status, error_code, latency_ms, usage_units, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), input.userId, input.provider, input.model, input.status,
    input.errorCode || null, Math.max(0, Math.round(input.latencyMs)), Math.max(0, Math.round(input.usageUnits)), Date.now(),
  ).run();
}
