/**
 * Server-side alert storage
 * For production, consider using a database or Vercel KV
 * This uses a JSON file as a simple storage solution
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface PriceAlert {
  id: string;
  cardName: string;
  targetPrice: number;
  scope: 'specific' | 'any';
  setId?: string;
  setName?: string;
  collectorNumber?: string;
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
}

const STORAGE_FILE = path.join(process.cwd(), 'data', 'price-alerts.json');

/**
 * Ensure the data directory exists
 */
async function ensureDataDir(): Promise<void> {
  const dataDir = path.dirname(STORAGE_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

/**
 * Get all alerts from storage
 */
export async function getAllAlerts(): Promise<PriceAlert[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(STORAGE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet, return empty array
      return [];
    }
    console.error('Error reading alerts:', error);
    return [];
  }
}

/**
 * Save alerts to storage
 */
export async function saveAlerts(alerts: PriceAlert[]): Promise<void> {
  try {
    await ensureDataDir();
    await fs.writeFile(STORAGE_FILE, JSON.stringify(alerts, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving alerts:', error);
    throw error;
  }
}

/**
 * Get active (non-triggered) alerts
 */
export async function getActiveAlerts(): Promise<PriceAlert[]> {
  const alerts = await getAllAlerts();
  return alerts.filter(alert => !alert.triggered);
}

/**
 * Mark an alert as triggered
 */
export async function markAlertTriggered(alertId: string): Promise<void> {
  const alerts = await getAllAlerts();
  const alert = alerts.find(a => a.id === alertId);
  if (alert) {
    alert.triggered = true;
    alert.triggeredAt = new Date().toISOString();
    await saveAlerts(alerts);
  }
}



