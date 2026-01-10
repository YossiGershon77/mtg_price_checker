import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import webpush from 'web-push';
import { getEbayToken } from '@/lib/ebay-auth';

const EBAY_BROWSE_API = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const MTG_CATEGORY_ID = '183454';

interface WatchlistItem {
  id: string;
  cardName: string;
  cardId: string;
  targetPrice: number;
  scope: 'specific' | 'any';
  setName?: string;
  collectorNumber?: string;
  createdAt: string;
}

interface Subscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt?: string;
}

interface EbaySearchResponse {
  itemSummaries?: Array<{
    itemId: string;
    title: string;
    price: {
      value: string;
      currency: string;
    };
    itemWebUrl: string;
  }>;
}

/**
 * Search eBay for Buy It Now listings
 */
async function searchEbayBuyItNow(cardName: string, setName?: string, collectorNumber?: string) {
  const tokenResult = await getEbayToken();
  
  if (!tokenResult.success) {
    throw new Error(`Failed to get eBay token: ${tokenResult.error}`);
  }

  // Build search query
  let searchQuery = cardName;
  if (setName) {
    searchQuery += ` ${setName}`;
  }
  if (collectorNumber) {
    searchQuery += ` ${collectorNumber}`;
  }

  // Build search URL with Buy It Now filter
  const searchParams = new URLSearchParams({
    category_ids: MTG_CATEGORY_ID,
    q: searchQuery,
    filter: 'buyingOptions:{FIXED_PRICE},priceCurrency:USD',
    sort: 'price', // Sort by price, lowest first
    limit: '10', // Get first 10 results
  });

  const url = `${EBAY_BROWSE_API}?${searchParams.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${tokenResult.token}`,
      'Content-Type': 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('eBay API error:', errorData);
    throw new Error(`eBay API error: ${response.status}`);
  }

  const data: EbaySearchResponse = await response.json();
  return data.itemSummaries || [];
}

/**
 * Send push notification
 */
async function sendPushNotification(
  subscription: Subscription,
  title: string,
  body: string,
  url: string
) {
  // Set VAPID keys
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    console.error('VAPID keys not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env.local');
    return;
  }

  webpush.setVapidDetails(
    'mailto:your-email@example.com', // Contact email (update this)
    publicKey,
    privateKey
  );

  const payload = JSON.stringify({
    title,
    body,
    url,
  });

  try {
    await webpush.sendNotification(subscription, payload);
    console.log('Push notification sent successfully');
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    // If subscription is invalid (410), you might want to remove it
    if (error.statusCode === 410) {
      console.log('Subscription expired, should be removed');
    }
    throw error;
  }
}

/**
 * GET /api/cron/check-prices
 * Check watchlist items and send notifications if prices drop below target
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Security: Check if key matches CRON_SECRET
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
  
    if (key !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Load Watchlist: Use fs.promises.readFile to read watchlist.json
    const watchlistFile = path.join(process.cwd(), 'watchlist.json');
    let watchlistItems: WatchlistItem[] = [];

    try {
      const watchlistData = await fs.readFile(watchlistFile, 'utf-8');
      watchlistItems = JSON.parse(watchlistData);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet, return empty status
        return NextResponse.json({
          checked: 0,
          notified: 0,
          message: 'No watchlist items found',
        });
      }
      throw error;
    }

    if (watchlistItems.length === 0) {
      return NextResponse.json({
        checked: 0,
        notified: 0,
        message: 'No watchlist items to check',
      });
    }

    // Load push subscriptions
    const subscriptionsFile = path.join(process.cwd(), 'subscriptions.json');
    let subscriptions: Subscription[] = [];

    try {
      const subscriptionsData = await fs.readFile(subscriptionsFile, 'utf-8');
      subscriptions = JSON.parse(subscriptionsData);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return NextResponse.json({
          checked: 0,
          notified: 0,
          message: 'No push subscriptions found',
        });
      }
      throw error;
    }

    if (subscriptions.length === 0) {
      return NextResponse.json({
        checked: 0,
        notified: 0,
        message: 'No push subscriptions found',
      });
    }

    let checked = 0;
    let notified = 0;
    const errors: string[] = [];

    // 3. eBay Search: For each item in the watchlist, fetch the lowest 'Buy It Now' price
    for (const item of watchlistItems) {
      try {
        checked++;

        // Search eBay for Buy It Now listings
        const listings = await searchEbayBuyItNow(
          item.cardName,
          item.setName,
          item.collectorNumber
        );

        if (listings.length === 0) {
          continue;
        }

        // Find the lowest priced listing
        const lowestListing = listings.reduce((lowest, current) => {
          const currentPrice = parseFloat(current.price.value);
          const lowestPrice = parseFloat(lowest.price.value);
          return currentPrice < lowestPrice ? current : lowest;
        });

        const lowestPrice = parseFloat(lowestListing.price.value);

        // 4. Logic: If the lowest price found is <= the user's target price
        if (lowestPrice <= item.targetPrice) {
          // Send notification to all subscriptions
          const notificationPromises = subscriptions.map((subscription) =>
            sendPushNotification(
              subscription,
              `🎯 Deal Found: ${item.cardName}`, // Title: "🎯 Deal Found: [Card Name]"
              `Now available for $${lowestPrice.toFixed(2)}! Tap to view on eBay.`, // Body: "Now available for $[Price]! Tap to view on eBay."
              lowestListing.itemWebUrl
            ).catch((error) => {
              console.error(`Failed to send notification to subscription:`, error);
              return null;
            })
          );

          await Promise.allSettled(notificationPromises);
          notified++;
          console.log(`✅ Notified for ${item.cardName} - Price: $${lowestPrice.toFixed(2)}, Target: $${item.targetPrice}`);
        }
      } catch (error) {
        const errorMsg = `Error checking ${item.cardName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // 5. Respond: Return a JSON status of what was checked
    return NextResponse.json({
      checked,
      notified,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error in check-prices cron:', error);
    return NextResponse.json(
      {
        error: 'Failed to check prices',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
