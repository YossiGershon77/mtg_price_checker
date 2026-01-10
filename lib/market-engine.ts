/**
 * Market Engine - Combines data from Scryfall and eBay
 */

import { fetchCardByName } from './scryfall';
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
 * @returns Promise<MarketData> - Unified object containing card details and eBay listings
 */
export async function getMarketData(cardName: string): Promise<MarketData> {
  try {
    // Fetch card data from Scryfall
    const cardData = await fetchCardByName(cardName);

    // Convert to Card interface format
    const card: Card = {
      id: cardData.id,
      name: cardData.name,
      set: cardData.set,
      image: cardData.image,
      market_price: cardData.market_price,
      prices: cardData.prices,
    };

    // Search for eBay listings
    const ebayListings = await searchEbayListings(cardName);

    return {
      card,
      ebayListings,
    };
  } catch (error) {
    console.error('Error fetching market data:', error);
    throw error;
  }
}

