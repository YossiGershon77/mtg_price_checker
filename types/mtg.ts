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

