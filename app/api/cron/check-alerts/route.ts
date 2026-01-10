import { NextRequest, NextResponse } from 'next/server';
import { getActiveAlerts, markAlertTriggered, PriceAlert } from '@/lib/alert-storage';
import { getEbayToken } from '@/lib/ebay-auth';

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

/**
 * Search eBay for a card
 */
async function searchEbay(cardName: string, setName?: string, collectorNumber?: string) {
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

  // Build search URL
  const searchParams = new URLSearchParams({
    category_ids: MTG_CATEGORY_ID,
    q: searchQuery,
    filter: 'buyingOptions:{FIXED_PRICE},priceCurrency:USD',
    sort: 'price',
    limit: '20',
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
 * Check if any listing matches the alert criteria
 */
function checkAlert(alert: PriceAlert, listings: any[]): any | null {
  for (const listing of listings) {
    const price = parseFloat(listing.price.value);
    if (!isNaN(price) && price <= alert.targetPrice) {
      return {
        listing,
        alert,
        price,
      };
    }
  }
  return null;
}

/**
 * Trigger a notification (placeholder - can be extended with email, push, etc.)
 */
async function triggerNotification(alert: PriceAlert, match: any) {
  console.log('🔔 PRICE ALERT TRIGGERED!');
  console.log(`Card: ${alert.cardName}`);
  console.log(`Target Price: $${alert.targetPrice}`);
  console.log(`Found Listing: ${match.listing.title}`);
  console.log(`Price: $${match.price.toFixed(2)}`);
  console.log(`URL: ${match.listing.itemWebUrl}`);
  console.log(`Scope: ${alert.scope}`);
  if (alert.setName) {
    console.log(`Set: ${alert.setName} #${alert.collectorNumber}`);
  }
  
  // TODO: Implement actual notification mechanism:
  // - Send email (using Resend, SendGrid, etc.)
  // - Send push notification
  // - Webhook
  // - etc.
}

/**
 * POST /api/cron/check-alerts
 * This endpoint can be called by:
 * - Vercel Cron Jobs (schedule in vercel.json)
 * - External cron services (cron-job.org, etc.)
 * - Manual trigger
 */
export async function POST(request: NextRequest) {
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

    // Get all active alerts
    const alerts = await getActiveAlerts();
    
    if (alerts.length === 0) {
      return NextResponse.json({
        message: 'No active alerts to check',
        checked: 0,
        triggered: 0,
      });
    }

    let checked = 0;
    let triggered = 0;
    const errors: string[] = [];

    // Check each alert
    for (const alert of alerts) {
      try {
        checked++;
        
        // Search eBay for the card
        const listings = await searchEbay(
          alert.cardName,
          alert.scope === 'specific' ? alert.setName : undefined,
          alert.scope === 'specific' ? alert.collectorNumber : undefined
        );

        // Check if any listing matches
        const match = checkAlert(alert, listings);
        
        if (match) {
          // Trigger notification
          await triggerNotification(alert, match);
          
          // Mark alert as triggered
          await markAlertTriggered(alert.id);
          
          triggered++;
        }
      } catch (error) {
        const errorMsg = `Error checking alert ${alert.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    return NextResponse.json({
      message: 'Alert check completed',
      checked,
      triggered,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error in check-alerts cron:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request);
}

