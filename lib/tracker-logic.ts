/**
 * Price Tracker Logic
 * Handles watchlist management and price change detection using LocalStorage
 */

export interface PriceDropAlert {
  type: 'Price Drop';
  message: string;
  oldPrice: number;
  newPrice: number;
  percentageChange: number;
}

interface WatchlistItem {
  cardId: string;
  last_saved_price: number;
  savedAt: string;
}

const WATCHLIST_STORAGE_KEY = 'mtg_price_tracker_watchlist';

/**
 * Save a card to the watchlist with its current price
 * @param cardId - The card ID to save
 * @param currentPrice - The current price of the card
 */
export function saveToWatchlist(cardId: string, currentPrice: number): void {
  if (typeof window === 'undefined') {
    // Server-side rendering guard
    return;
  }

  try {
    // Get existing watchlist from LocalStorage
    const existingData = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    const watchlist: Record<string, WatchlistItem> = existingData
      ? JSON.parse(existingData)
      : {};

    // Save or update the card
    watchlist[cardId] = {
      cardId,
      last_saved_price: currentPrice,
      savedAt: new Date().toISOString(),
    };

    // Save back to LocalStorage
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  } catch (error) {
    console.error('Error saving to watchlist:', error);
  }
}

/**
 * Check if a card's price has dropped significantly
 * @param cardId - The card ID to check
 * @param newPrice - The new/current price to compare
 * @returns PriceDropAlert object if price dropped 10% or more, null otherwise
 */
export function checkPriceChanges(
  cardId: string,
  newPrice: number
): PriceDropAlert | null {
  if (typeof window === 'undefined') {
    // Server-side rendering guard
    return null;
  }

  try {
    // Get watchlist from LocalStorage
    const existingData = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!existingData) {
      return null;
    }

    const watchlist: Record<string, WatchlistItem> = JSON.parse(existingData);
    const watchlistItem = watchlist[cardId];

    if (!watchlistItem) {
      // Card is not in watchlist
      return null;
    }

    const lastSavedPrice = watchlistItem.last_saved_price;

    // Check if new price is 10% or more lower than last saved price
    const priceDifference = lastSavedPrice - newPrice;
    const percentageChange = (priceDifference / lastSavedPrice) * 100;

    if (percentageChange >= 10) {
      return {
        type: 'Price Drop',
        message: `Price dropped ${percentageChange.toFixed(1)}%`,
        oldPrice: lastSavedPrice,
        newPrice: newPrice,
        percentageChange: percentageChange,
      };
    }

    return null;
  } catch (error) {
    console.error('Error checking price changes:', error);
    return null;
  }
}

/**
 * Check if a card is in the watchlist
 * @param cardId - The card ID to check
 * @returns true if card is in watchlist, false otherwise
 */
export function isInWatchlist(cardId: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const existingData = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!existingData) {
      return false;
    }

    const watchlist: Record<string, WatchlistItem> = JSON.parse(existingData);
    return !!watchlist[cardId];
  } catch (error) {
    console.error('Error checking watchlist:', error);
    return false;
  }
}

/**
 * Remove a card from the watchlist
 * @param cardId - The card ID to remove
 */
export function removeFromWatchlist(cardId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const existingData = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!existingData) {
      return;
    }

    const watchlist: Record<string, WatchlistItem> = JSON.parse(existingData);
    delete watchlist[cardId];

    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  } catch (error) {
    console.error('Error removing from watchlist:', error);
  }
}




