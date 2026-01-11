import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

/**
 * GET /api/status
 * Check database connection status and get last check time
 */
export async function GET() {
  try {
    // Test database connection by trying to get a value
    let dbConnected = false;
    try {
      await redis.get('watchlist');
      dbConnected = true;
    } catch (error) {
      dbConnected = false;
    }

    // Get last check timestamp
    const lastCheck = await redis.get('last_price_check');

    return NextResponse.json({
      success: true,
      database: dbConnected ? 'connected' : 'disconnected',
      lastCheck: lastCheck || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        database: 'disconnected',
        lastCheck: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

