'use server';

/**
 * eBay search actions for MTG card listings
 * Specialized search function with filters for snipes
 */

import { EbayListing } from '@/types/mtg';
import { getEbayAccessToken } from '@/lib/ebay-auth';

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
    image?: {
      imageUrl?: string;
    };
    thumbnailImages?: Array<{
      imageUrl?: string;
    }>;
    condition?: string;
    conditionId?: string;
    buyingOptions?: string[];
  }>;
  total: number;
  limit: number;
  offset: number;
}

/**
 * Search for eBay listings with filters optimized for MTG card snipes
 * @param query - Search term for the card name
 * @returns Promise<EbayListing[]> - Array of eBay listings (empty array on error)
 */
export async function searchEbaySnipes(query: string): Promise<EbayListing[]> {
  try {
    // Get secure access token
    const accessToken = await getEbayAccessToken();

    // Build search URL with filters
    const searchParams = new URLSearchParams({
      category_ids: MTG_CATEGORY_ID,
      q: query,
      buyingOptions: 'FIXED_PRICE',
      conditions: 'NEW,USED',
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
      // If API is down or returns error, return empty array
      console.error(`eBay API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data: EbaySearchResponse = await response.json();

    if (!data.itemSummaries || data.itemSummaries.length === 0) {
      return [];
    }

    // Transform eBay response to our EbayListing type
    return data.itemSummaries.map(item => ({
      title: item.title,
      price: parseFloat(item.price.value) || 0,
      url: item.itemWebUrl,
      isDeal: false, // Will be calculated elsewhere if needed
    }));
  } catch (error) {
    // If eBay API is down or any error occurs, return empty array
    console.error('Error searching eBay listings:', error);
    return [];
  }
}

