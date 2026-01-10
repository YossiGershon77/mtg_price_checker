/**
 * Server-side watchlist storage
 * Saves watchlist items to watchlist.json file
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface WatchlistItem {
  id: string;
  cardName: string;
  cardId: string;
  targetPrice: number;
  scope: 'specific' | 'any';
  setName?: string;
  collectorNumber?: string;
  createdAt: string;
}

const STORAGE_FILE = path.join(process.cwd(), 'watchlist.json');

/**
 * Ensure the data directory exists
 */
async function ensureDataDir(): Promise<void> {
  // Since watchlist.json is in the root directory (process.cwd()),
  // the directory already exists, so we don't need to create it
  // This function is kept for consistency with alert-storage.ts
}

/**
 * Get all watchlist items from storage
 */
export async function getAllWatchlistItems(): Promise<WatchlistItem[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(STORAGE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, return empty array
      return [];
    }
    console.error('Error reading watchlist:', error);
    return [];
  }
}

/**
 * Save watchlist items to storage
 */
export async function saveWatchlistItems(items: WatchlistItem[]): Promise<void> {
  try {
    await ensureDataDir();
    await fs.writeFile(STORAGE_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving watchlist:', error);
    throw error;
  }
}

/**
 * Add a new watchlist item
 */
export async function addWatchlistItem(item: Omit<WatchlistItem, 'id' | 'createdAt'>): Promise<WatchlistItem> {
  const items = await getAllWatchlistItems();
  const newItem: WatchlistItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    createdAt: new Date().toISOString(),
  };
  items.push(newItem);
  await saveWatchlistItems(items);
  return newItem;
}

