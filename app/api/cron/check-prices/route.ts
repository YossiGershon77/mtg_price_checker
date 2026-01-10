import { NextRequest, NextResponse } from 'next/server';
import { getAllWatchlistItems, WatchlistItem } from '@/lib/watchlist-storage';
import { getEbayToken } from '@/lib/ebay-auth';
import { promises as fs } from 'fs';
import path from 'path';
import webpush from 'web-push';

const EBAY_BROWSE_API = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const MTG_CATEGORY_ID = '183454';

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

interface Subscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt?: string;
}

interface NotificationHistory {
  watchlistItemId: string;
  lastNotifiedListingId: string;
  lastNotifiedAt: string;
}

const NOTIFICATION_HISTORY_FILE = path.join(process.cwd(), 'notification-history.json');

/**
 * Load notification history
 */
async function loadNotificationHistory(): Promise<Record<string, NotificationHistory>> {
  try {
    const data = await fs.readFile(NOTIFICATION_HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('Error reading notification history:', error);
    return {};
  }
}

/**
 * Save notification history
 */
async function saveNotificationHistory(history: Record<string, NotificationHistory>): Promise<void> {
  await fs.writeFile(NOTIFICATION_HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

/**
 * Load subscriptions
 */
async function loadSubscriptions(): Promise<Subscription[]> {
  try {
    const subscriptionsFile = path.join(process.cwd(), 'subscriptions.json');
    const data = await fs.readFile(subscriptionsFile, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Error reading subscriptions:', error);
    return [];
  }
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
  // Set VAPID keys (should be in environment variables)
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
  }
}

/**
 * GET /api/cron/check-prices
 * Check watchlist items and send notifications if prices drop below target
 */
export async function GET(request: NextRequest) {
  try {
    // Optional: Add authentication to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Load watchlist and subscriptions
    const watchlistItems = await getAllWatchlistItems();
    const subscriptions = await loadSubscriptions();
    const notificationHistory = await loadNotificationHistory();

    if (watchlistItems.length === 0) {
      return NextResponse.json({
        message: 'No items in watchlist',
        checked: 0,
        notified: 0,
      });
    }

    if (subscriptions.length === 0) {
      return NextResponse.json({
        message: 'No push notification subscriptions found',
        checked: 0,
        notified: 0,
      });
    }

    let checked = 0;
    let notified = 0;
    const errors: string[] = [];

    // Check each watchlist item
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

        // Check if price is below target
        if (lowestPrice < item.targetPrice) {
          // Check if we already notified for this listing
          const historyKey = item.id;
          const history = notificationHistory[historyKey];

          if (history && history.lastNotifiedListingId === lowestListing.itemId) {
            // Already notified for this listing, skip
            continue;
          }

          // Send notification to all subscriptions
          const notificationPromises = subscriptions.map((subscription) =>
            sendPushNotification(
              subscription,
              `🎯 Sniper Alert: ${item.cardName}`,
              `Found for $${lowestPrice.toFixed(2)}! Tap to buy.`,
              lowestListing.itemWebUrl
            )
          );

          await Promise.allSettled(notificationPromises);

          // Update notification history
          notificationHistory[historyKey] = {
            watchlistItemId: item.id,
            lastNotifiedListingId: lowestListing.itemId,
            lastNotifiedAt: new Date().toISOString(),
          };

          notified++;
          console.log(`✅ Notified for ${item.cardName} - Price: $${lowestPrice.toFixed(2)}, Target: $${item.targetPrice}`);
        }
      } catch (error) {
        const errorMsg = `Error checking ${item.cardName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Save updated notification history
    await saveNotificationHistory(notificationHistory);

    return NextResponse.json({
      success: true,
      checked,
      notified,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error in check-prices cron:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check prices',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

