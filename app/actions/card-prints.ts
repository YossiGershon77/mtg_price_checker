'use server';

import { fetchCardPrints } from '@/lib/scryfall';
import { CardPrint } from '@/types/mtg';

/**
 * Server action to fetch all prints of a card
 * @param cardName - The name of the card to search for
 * @returns Promise with card name, oracle_id, and array of all prints
 */
export async function getCardPrints(cardName: string): Promise<{
  name: string;
  oracle_id: string;
  prints: CardPrint[];
} | { error: string }> {
  try {
    return await fetchCardPrints(cardName);
  } catch (error) {
    console.error('Error fetching card prints:', error);
    return { error: error instanceof Error ? error.message : 'Failed to fetch card prints' };
  }
}

