import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

interface Subscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt?: string;
}

/**
 * POST /api/subscribe
 * Save push notification subscription to Upstash Redis
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

    if (!subscription.endpoint || !subscription.keys) {
      return NextResponse.json(
        { success: false, error: 'Invalid subscription object' },
        { status: 400 }
      );
    }

    // Get existing subscriptions from Redis
    const subscriptions: Subscription[] = (await redis.get('subscriptions')) || [];

    // Check if subscription already exists (by endpoint)
    const existingIndex = subscriptions.findIndex(
      sub => sub.endpoint === subscription.endpoint
    );

    const subscriptionWithTimestamp: Subscription = {
      ...subscription,
      createdAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      // Update existing subscription
      subscriptions[existingIndex] = subscriptionWithTimestamp;
    } else {
      // Add new subscription
      subscriptions.push(subscriptionWithTimestamp);
    }

    // Save to Redis
    await redis.set('subscriptions', subscriptions);

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
