import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { getEbayToken } from '@/lib/ebay-auth';
import { Redis } from '@upstash/redis';

// Initialize Redis
const redis = Redis.fromEnv();

const EBAY_BROWSE_API = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const MTG_CATEGORY_ID = '183454';

interface WatchlistItem {
  id: string;
  cardName: string;
  targetPrice: number;
  setName?: string;
  createdAt: string;
}

interface Subscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get watchlist and subscriptions from Upstash Redis
    const watchlist: WatchlistItem[] = (await redis.get('watchlist')) || [];
    const subscriptions: Subscription[] = (await redis.get('subscriptions')) || [];

    if (watchlist.length === 0) {
      return NextResponse.json({ 
        checked: 0, 
        notified: 0,
        message: 'Watchlist empty' 
      });
    }

    if (subscriptions.length === 0) {
      return NextResponse.json({ 
        checked: watchlist.length, 
        notified: 0,
        message: 'No subscriptions found' 
      });
    }

    // Set up webpush VAPID keys
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
      return NextResponse.json({ 
        error: 'VAPID keys not configured' 
      }, { status: 500 });
    }

    webpush.setVapidDetails(
      'mailto:your-email@example.com',
      publicKey,
      privateKey
    );

    const tokenResult = await getEbayToken();
    if (!tokenResult.success) {
      return NextResponse.json({ 
        error: `Failed to get eBay token: ${tokenResult.error}` 
      }, { status: 500 });
    }

    let checked = 0;
    let notified = 0;
    const errors: string[] = [];

    // Check each watchlist item
    for (const item of watchlist) {
      try {
        checked++;

        // Build search query
        let searchQuery = item.cardName;
        if (item.setName) {
          searchQuery += ` ${item.setName}`;
        }

        // Search eBay for Buy It Now listings
        const searchParams = new URLSearchParams({
          category_ids: MTG_CATEGORY_ID,
          q: searchQuery,
          filter: 'buyingOptions:{FIXED_PRICE},priceCurrency:USD',
          sort: 'price',
          limit: '10',
        });

        const url = `${EBAY_BROWSE_API}?${searchParams.toString()}`;
        const res = await fetch(url, {
          headers: { 
            'Authorization': `Bearer ${tokenResult.token}`, 
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
            'Content-Type': 'application/json'
          }
        });

        if (!res.ok) {
          const errorData = await res.json();
          errors.push(`eBay API error for ${item.cardName}: ${res.status}`);
          continue;
        }

        const data = await res.json();
        const listings = data.itemSummaries || [];

        if (listings.length === 0) {
          continue;
        }

        // Find the lowest priced listing
        const lowestListing = listings.reduce((lowest: any, current: any) => {
          const currentPrice = parseFloat(current.price.value);
          const lowestPrice = parseFloat(lowest.price.value);
          return currentPrice < lowestPrice ? current : lowest;
        });

        const lowestPrice = parseFloat(lowestListing.price.value);

        // Check if price is <= target price
        if (lowestPrice <= item.targetPrice) {
          // Notification format: "<CardName> was sniped for <price>"
          const title = `${item.cardName} was sniped for $${lowestPrice.toFixed(2)}`;
          const body = 'We found a deal for the card you requested';

          const payload = JSON.stringify({
            title,
            body,
            url: lowestListing.itemWebUrl
          });

          // Send notification to all subscriptions
          const notificationPromises = subscriptions.map(sub => 
            webpush.sendNotification(sub, payload).catch((err) => {
              console.error('Failed to send notification:', err);
              return null;
            })
          );

          await Promise.allSettled(notificationPromises);
          notified++;
        }
      } catch (error: any) {
        errors.push(`Error checking ${item.cardName}: ${error.message}`);
      }
    }

    // Store last check timestamp in Redis
    await redis.set('last_price_check', new Date().toISOString());

    return NextResponse.json({ 
      checked, 
      notified,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
