import { NextResponse } from 'next/server';
import { getChatGPTUser } from '../../chatgpt-auth';
import { getAccountSummary } from '../../../server/accounts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ account: null });
  try {
    return NextResponse.json({ account: await getAccountSummary(user) });
  } catch (error) {
    console.error('Failed to load account', error);
    return NextResponse.json({ error: 'Account service is unavailable.' }, { status: 503 });
  }
}
