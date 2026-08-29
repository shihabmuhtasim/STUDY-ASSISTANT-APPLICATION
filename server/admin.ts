import { env } from 'cloudflare:workers';
import { ensureDatabaseSchema } from '../db/init';
import { FREE_MONTHLY_AI_LIMIT, PRO_MONTHLY_AI_LIMIT, remainingPercentage } from './aiUsage';
import { clearAIControlCache } from './modelControls';
import type { VerifiedFirebaseUser } from './firebaseUser';

const MANAGED_MODELS = [
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', provider: 'Gemini' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', provider: 'Gemini' },
  { id: '@cf/qwen/qwen3-30b-a3b-fp8', label: 'Qwen 3', provider: 'Cloudflare' },
  { id: '@cf/zai-org/glm-4.7-flash', label: 'GLM 4.7 Flash', provider: 'Cloudflare' },
  { id: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4', provider: 'Cloudflare' },
  { id: '@cf/meta/llama-3.2-3b-instruct', label: 'Llama 3.2', provider: 'Cloudflare' },
  { id: '@cf/nvidia/nemotron-3-120b-a12b', label: 'NVIDIA Nemotron 3', provider: 'Cloudflare' },
  { id: '@cf/meta/llama-3.2-1b-instruct', label: 'Study Basic', provider: 'Cloudflare' },
];

function period(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function audit(admin: VerifiedFirebaseUser, action: string, target: string, details?: unknown) {
  await env.DB.prepare(`
    INSERT INTO admin_audit_events (id, admin_user_id, action, target, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), admin.uid, action, target, details ? JSON.stringify(details).slice(0, 2_000) : null, Date.now()).run();
}

export async function getAdminOverview() {
  await ensureDatabaseSchema();
  const now = Date.now();
  const month = period();
  const [totals, active, requests, users, health, controls, paused, audits] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN plan = 'pro' THEN 1 ELSE 0 END) pro, SUM(CASE WHEN plan = 'free' THEN 1 ELSE 0 END) free FROM users`).first<{ total: number; pro: number; free: number }>(),
    env.DB.prepare('SELECT COUNT(*) total FROM users WHERE last_seen_at >= ?').bind(now - 30 * 86_400_000).first<{ total: number }>(),
    env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) errors, SUM(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END) fallbacks, AVG(latency_ms) latency FROM ai_request_events WHERE created_at >= ?`).bind(now - 24 * 60 * 60 * 1_000).first<{ total: number; errors: number; fallbacks: number; latency: number }>(),
    env.DB.prepare(`
      SELECT u.id, u.email, u.display_name displayName, u.plan, u.role, u.created_at createdAt, u.last_seen_at lastSeenAt, COALESCE(c.used, 0) usage
      FROM users u LEFT JOIN ai_usage_counters c ON c.user_id = u.id AND c.period = ?
      ORDER BY u.last_seen_at DESC LIMIT 100
    `).bind(month).all<{ id: string; email: string; displayName: string; plan: 'free' | 'pro'; role: 'user' | 'admin'; createdAt: number; lastSeenAt: number; usage: number }>(),
    env.DB.prepare(`
      SELECT provider, model, COUNT(*) requests, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) errors,
        SUM(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END) fallbacks, ROUND(AVG(latency_ms)) latency
      FROM ai_request_events WHERE created_at >= ? GROUP BY provider, model ORDER BY requests DESC
    `).bind(now - 7 * 86_400_000).all<{ provider: string; model: string; requests: number; errors: number; fallbacks: number; latency: number }>(),
    env.DB.prepare('SELECT model, enabled FROM ai_model_controls').all<{ model: string; enabled: number }>(),
    env.DB.prepare("SELECT value FROM app_settings WHERE key = 'hosted_ai_paused'").first<{ value: string }>(),
    env.DB.prepare('SELECT action, target, details, created_at createdAt FROM admin_audit_events ORDER BY created_at DESC LIMIT 20').all<{ action: string; target: string; details: string | null; createdAt: number }>(),
  ]);
  const enabledByModel = new Map((controls.results || []).map((row) => [row.model, row.enabled !== 0]));
  return {
    summary: {
      users: Number(totals?.total) || 0,
      freeUsers: Number(totals?.free) || 0,
      proUsers: Number(totals?.pro) || 0,
      activeUsers30d: Number(active?.total) || 0,
      requests24h: Number(requests?.total) || 0,
      errorRate24h: requests?.total ? Math.round((Number(requests.errors) || 0) / Number(requests.total) * 100) : 0,
      fallbackRate24h: requests?.total ? Math.round((Number(requests.fallbacks) || 0) / Number(requests.total) * 100) : 0,
      averageLatency24h: Math.round(Number(requests?.latency) || 0),
    },
    users: (users.results || []).map((user) => {
      const limit = user.role === 'admin' ? 10_000_000 : user.plan === 'pro' ? PRO_MONTHLY_AI_LIMIT : FREE_MONTHLY_AI_LIMIT;
      return { ...user, usagePercentLeft: remainingPercentage(limit, Math.max(0, limit - Number(user.usage))) };
    }),
    modelHealth: health.results || [],
    modelControls: MANAGED_MODELS.map((model) => ({ ...model, enabled: enabledByModel.get(model.id) ?? true })),
    hostedAIPaused: paused?.value === 'true',
    audits: audits.results || [],
  };
}

export async function updateUserPlan(admin: VerifiedFirebaseUser, userId: string, plan: 'free' | 'pro') {
  const target = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first<{ role: string }>();
  if (!target) throw new Error('USER_NOT_FOUND');
  if (target.role === 'admin') throw new Error('ADMIN_PLAN_LOCKED');
  await env.DB.prepare('UPDATE users SET plan = ?, last_seen_at = last_seen_at WHERE id = ?').bind(plan, userId).run();
  await audit(admin, 'user.plan.updated', userId, { plan });
}

export async function resetUserUsage(admin: VerifiedFirebaseUser, userId: string) {
  await env.DB.prepare('DELETE FROM ai_usage_counters WHERE user_id = ? AND period = ?').bind(userId, period()).run();
  await audit(admin, 'user.usage.reset', userId);
}

export async function updateModelControl(admin: VerifiedFirebaseUser, model: string, enabled: boolean) {
  if (!MANAGED_MODELS.some((item) => item.id === model)) throw new Error('UNKNOWN_MODEL');
  await env.DB.prepare(`INSERT INTO ai_model_controls (model, enabled, updated_at) VALUES (?, ?, ?) ON CONFLICT(model) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`).bind(model, enabled ? 1 : 0, Date.now()).run();
  clearAIControlCache();
  await audit(admin, enabled ? 'model.enabled' : 'model.disabled', model);
}

export async function updateHostedAIPause(admin: VerifiedFirebaseUser, paused: boolean) {
  await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('hosted_ai_paused', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(String(paused), Date.now()).run();
  clearAIControlCache();
  await audit(admin, paused ? 'hosted_ai.paused' : 'hosted_ai.resumed', 'hosted-ai');
}
