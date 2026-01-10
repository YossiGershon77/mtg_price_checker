'use server';

/**
 * Server action wrapper for market data fetching
 */

import { getMarketData } from '@/lib/market-engine';
import { MarketData } from '@/lib/market-engine';

/**
 * Server action to fetch market data for a card
 * @param cardName - The name of the card to search for
 * @param printId - Optional specific print ID (Scryfall card ID)
 * @param setName - Optional set name for eBay search refinement
 * @param collectorNumber - Optional collector number for eBay search refinement
 * @returns Promise<MarketData | { error: string }> - Unified market data or error object
 */
export async function fetchMarketData(
  cardName: string,
  printId?: string,
  setName?: string,
  collectorNumber?: string
): Promise<MarketData | { error: string }> {
  return await getMarketData(cardName, printId, setName, collectorNumber);
}



