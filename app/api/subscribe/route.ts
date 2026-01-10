import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * POST /api/subscribe
 * Save push notification subscription
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscription } = body;

    // Validate subscription object
    if (!subscription || typeof subscription !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Subscription object is required' },
        { status: 400 }
      );
    }

    // Read existing subscriptions or initialize empty array
    const subscriptionsFile = path.join(process.cwd(), 'subscriptions.json');
    let subscriptions: any[] = [];

    try {
      const data = await fs.readFile(subscriptionsFile, 'utf-8');
      subscriptions = JSON.parse(data);
    } catch (error: any) {
      // File doesn't exist yet, start with empty array
      if (error.code !== 'ENOENT') {
        console.error('Error reading subscriptions file:', error);
      }
    }

    // Add the new subscription (you might want to check for duplicates)
    subscriptions.push({
      ...subscription,
      createdAt: new Date().toISOString(),
    });

    // Save subscriptions to file
    await fs.writeFile(subscriptionsFile, JSON.stringify(subscriptions, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error saving subscription:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

