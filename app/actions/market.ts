'use server';

/**
 * Server action wrapper for market data fetching
 */

import { getMarketData } from '@/lib/market-engine';
import { MarketData } from '@/lib/market-engine';

/**
 * Server action to fetch market data for a card
 * @param cardName - The name of the card to search for
 * @returns Promise<MarketData> - Unified market data
 */
export async function fetchMarketData(cardName: string): Promise<MarketData> {
  return await getMarketData(cardName);
}



