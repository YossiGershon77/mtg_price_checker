'use server';

/**
 * eBay API integration for MTG card listings
 * Uses OAuth 2.0 Client Credentials flow
 */

import { EbayListing } from '@/types/mtg';
import { getEbayAccessToken } from '@/lib/ebay-auth';

const EBAY_API_BASE = 'https://api.ebay.com';
const EBAY_BROWSE_API = `${EBAY_API_BASE}/buy/browse/v1/item_summary/search`;
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
    condition?: string;
    itemAffiliateWebUrl?: string;
    estimatedAvailabilities?: Array<{
      availabilityThreshold?: string;
    }>;
  }>;
  total: number;
  limit: number;
  offset: number;
}

/**
 * Search for eBay listings in the MTG category
 * @param searchQuery - Search term for the card name
 * @returns Promise<EbayListing[]> - Array of eBay listings
 */
export async function searchEbayListings(searchQuery: string): Promise<EbayListing[]> {
  try {
    // Get access token
    const accessToken = await getEbayAccessToken();

    // Build search URL with MTG category filter
    const searchParams = new URLSearchParams({
      category_ids: MTG_CATEGORY_ID,
      q: searchQuery,
      limit: '20', // Limit to 20 results
    });

    const url = `${EBAY_BROWSE_API}?${searchParams.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US', // Default to US marketplace
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`eBay API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data: EbaySearchResponse = await response.json();

    if (!data.itemSummaries || data.itemSummaries.length === 0) {
      return [];
    }

    // Convert eBay listings to our EbayListing format
    // Determine if it's a deal by checking if price is below market average
    // For simplicity, we'll mark items as deals if they're in the lower price range
    const prices = data.itemSummaries
      .map(item => parseFloat(item.price.value))
      .filter(price => !isNaN(price))
      .sort((a, b) => a - b);

    const medianPrice = prices.length > 0 
      ? prices[Math.floor(prices.length / 2)] 
      : null;

    return data.itemSummaries.map(item => {
      const price = parseFloat(item.price.value);
      const isDeal = medianPrice !== null && price < medianPrice * 0.9; // 10% below median

      return {
        title: item.title,
        price: price,
        url: item.itemWebUrl,
        isDeal: isDeal,
      };
    });
  } catch (error) {
    console.error('Error searching eBay listings:', error);
    throw error;
  }
}

