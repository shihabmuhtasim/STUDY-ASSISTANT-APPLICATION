import { NextResponse } from 'next/server';
import { getAccountSummary } from '../../../../server/accounts';
import { getAdminOverview, resetUserUsage, updateHostedAIPause, updateModelControl, updateUserPlan } from '../../../../server/admin';
import { verifyFirebaseRequest } from '../../../../server/firebaseUser';

export const dynamic = 'force-dynamic';

async function adminUser(request: Request) {
  const user = await verifyFirebaseRequest(request);
  if (!user) return null;
  const account = await getAccountSummary(user);
  return account.role === 'admin' ? user : null;
}

export async function GET(request: Request) {
  const user = await adminUser(request);
  if (!user) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  return NextResponse.json(await getAdminOverview(), { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await adminUser(request);
  if (!user) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    if (body?.action === 'user-plan' && typeof body.userId === 'string' && (body.plan === 'free' || body.plan === 'pro')) await updateUserPlan(user, body.userId, body.plan);
    else if (body?.action === 'reset-usage' && typeof body.userId === 'string') await resetUserUsage(user, body.userId);
    else if (body?.action === 'model-control' && typeof body.model === 'string' && typeof body.enabled === 'boolean') await updateModelControl(user, body.model, body.enabled);
    else if (body?.action === 'hosted-ai' && typeof body.paused === 'boolean') await updateHostedAIPause(user, body.paused);
    else return NextResponse.json({ error: 'Invalid administrator action.' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'ADMIN_ACTION_FAILED';
    return NextResponse.json({ error: code === 'ADMIN_PLAN_LOCKED' ? 'Administrator plans cannot be changed here.' : 'The administrator action could not be completed.', code }, { status: 400 });
  }
}
