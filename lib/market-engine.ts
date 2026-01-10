/**
 * Market Engine - Combines data from Scryfall and eBay
 */

import { fetchCardByName, fetchCardById } from './scryfall';
import { searchEbayListings } from '@/app/actions/ebay';
import { Card, EbayListing } from '@/types/mtg';

/**
 * Unified market data response
 */
export interface MarketData {
  card: Card;
  ebayListings: EbayListing[];
}

/**
 * Get market data for a card by combining Scryfall and eBay data
 * @param cardName - The name of the card to search for
 * @param printId - Optional specific print ID (Scryfall card ID)
 * @param setName - Optional set name for eBay search refinement
 * @param collectorNumber - Optional collector number for eBay search refinement
 * @returns Promise<MarketData | { error: string }> - Unified object containing card details and eBay listings, or error object
 */
export async function getMarketData(
  cardName: string,
  printId?: string,
  setName?: string,
  collectorNumber?: string
): Promise<MarketData | { error: string }> {
  try {
    let cardData;
    
    if (printId) {
      // If printId is provided, fetch that specific print
      cardData = await fetchCardById(printId);
    } else {
      // Otherwise, fetch the most recent print (legacy behavior)
      cardData = await fetchCardByName(cardName);
    }

    // Convert to Card interface format
    const card: Card = {
      id: cardData.id,
      name: cardData.name,
      set: cardData.set,
      image: cardData.image,
      market_price: cardData.market_price,
      prices: cardData.prices,
      collector_number: cardData.collector_number,
      rarity: cardData.rarity,
    };

    // Search for eBay listings with refined query
    const ebayListingsResult = await searchEbayListings(cardName, setName, collectorNumber);
    
    // Check if the result is an error object
    if (ebayListingsResult && typeof ebayListingsResult === 'object' && 'error' in ebayListingsResult) {
      return { error: ebayListingsResult.error };
    }
    
    const ebayListings = ebayListingsResult as EbayListing[];

    return {
      card,
      ebayListings,
    };
  } catch (error) {
    console.error('Error fetching market data:', error);
    throw error;
  }
}

