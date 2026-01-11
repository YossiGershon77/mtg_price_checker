import { NextRequest, NextResponse } from 'next/server';
import { getAllAlerts, saveAlerts, PriceAlert } from '@/lib/alert-storage';

/**
 * POST /api/alerts/sync
 * Sync client-side alerts to server-side storage
 * This allows the cron job to access alerts stored in localStorage
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const alerts: PriceAlert[] = body.alerts || [];

    // Validate alerts structure
    const validAlerts = alerts.filter(alert => 
      alert.id &&
      alert.cardName &&
      alert.targetPrice &&
      alert.scope &&
      alert.createdAt
    );

    // Save to server storage
    await saveAlerts(validAlerts);

    return NextResponse.json({
      success: true,
      synced: validAlerts.length,
    });
  } catch (error) {
    console.error('Error syncing alerts:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync alerts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/alerts/sync
 * Get all alerts from server storage
 */
export async function GET() {
  try {
    const alerts = await getAllAlerts();
    return NextResponse.json({
      success: true,
      alerts,
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch alerts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



