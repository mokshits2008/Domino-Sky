import { NextResponse } from 'next/server';
import { ENGINE_VERSION } from '@/engine/config';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    engineVersion: ENGINE_VERSION,
    uptimeSec: process.uptime ? Math.floor(process.uptime()) : 0
  });
}
