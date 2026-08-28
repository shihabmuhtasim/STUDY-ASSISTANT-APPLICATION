import { NextResponse } from 'next/server';
import { getAccountSummary } from '../../../server/accounts';
import { verifyFirebaseRequest } from '../../../server/firebaseUser';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await verifyFirebaseRequest(request);
  if (!user) return NextResponse.json({ account: null }, { status: 401 });
  try {
    return NextResponse.json({ account: await getAccountSummary(user) });
  } catch (error) {
    console.error('Failed to load account', error);
    return NextResponse.json({ error: 'Account service is unavailable.' }, { status: 503 });
  }
}
