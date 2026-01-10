/**
 * Type definitions for MTG Price Tracker
 */

/**
 * Card interface for the MTG Price Tracker
 */
export interface Card {
  id: string;
  name: string;
  set: string;
  image: string;
  market_price: number | null;
  prices?: {
    usd: number | null;
    usd_foil: number | null;
  };
  collector_number?: string;
  rarity?: string;
}

/**
 * Card Print interface for version selection
 */
export interface CardPrint {
  id: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  image: string;
  market_price: number | null;
  foil_price: number | null;
  finishes: string[]; // ['foil', 'nonfoil'] or just one
}

/**
 * eBay listing interface
 */
export interface EbayListing {
  title: string;
  price: number;
  url: string;
  isDeal: boolean;
}

