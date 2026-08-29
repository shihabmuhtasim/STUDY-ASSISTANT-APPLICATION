import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { ensureDatabaseSchema } from '../../../db/init';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  try {
    await ensureDatabaseSchema();
    await env.DB.prepare('SELECT 1 AS healthy').first();
    return NextResponse.json({
      status: 'ok',
      database: 'available',
      hostedAI: env.AI || env.GEMINI_API_KEY ? 'available' : 'unconfigured',
      responseTimeMs: Date.now() - startedAt,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
