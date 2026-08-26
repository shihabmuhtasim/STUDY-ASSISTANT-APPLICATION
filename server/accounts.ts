import { and, count, eq, gte } from 'drizzle-orm';
import { getDb } from '../db';
import { ensureDatabaseSchema } from '../db/init';
import { aiUsageEvents, users } from '../db/schema';
import type { ChatGPTUser } from '../app/chatgpt-auth';

export const FREE_MONTHLY_AI_LIMIT = 30;
export const PRO_MONTHLY_AI_LIMIT = 1000;

export async function ensureUser(user: ChatGPTUser) {
  await ensureDatabaseSchema();
  const db = getDb();
  const now = Date.now();

  await db.insert(users).values({
    id: user.userId,
    email: user.email,
    displayName: user.displayName,
    plan: 'free',
    createdAt: now,
    lastSeenAt: now,
  }).onConflictDoUpdate({
    target: users.id,
    set: { email: user.email, displayName: user.displayName, lastSeenAt: now },
  });

  return db.query.users.findFirst({ where: eq(users.id, user.userId) });
}

export async function getMonthlyUsage(userId: string) {
  await ensureDatabaseSchema();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const [result] = await getDb()
    .select({ value: count() })
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.userId, userId), gte(aiUsageEvents.createdAt, start.getTime())));
  return result?.value ?? 0;
}

export async function getAccountSummary(user: ChatGPTUser) {
  const record = await ensureUser(user);
  const used = await getMonthlyUsage(user.userId);
  const plan = record?.plan ?? 'free';
  const limit = plan === 'pro' ? PRO_MONTHLY_AI_LIMIT : FREE_MONTHLY_AI_LIMIT;
  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    plan,
    aiUsage: used,
    aiLimit: limit,
    aiRemaining: Math.max(0, limit - used),
  };
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
