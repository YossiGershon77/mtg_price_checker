/**
 * Price Alert storage and management
 * Uses localStorage for client-side storage
 */

export interface PriceAlert {
  id: string;
  cardName: string;
  targetPrice: number;
  scope: 'specific' | 'any';
  setId?: string; // Scryfall set ID
  setName?: string;
  collectorNumber?: string;
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
}

const STORAGE_KEY = 'mtg_price_alerts';

/**
 * Get all price alerts from storage
 */
export function getAllAlerts(): PriceAlert[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error reading price alerts:', error);
    return [];
  }
}

/**
 * Save a price alert
 */
export async function saveAlert(alert: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered'>): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    const alerts = getAllAlerts();
    const newAlert: PriceAlert = {
      ...alert,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      createdAt: new Date().toISOString(),
      triggered: false,
    };
    alerts.push(newAlert);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
    
    // Sync to server for cron job access
    try {
      await fetch('/api/alerts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts }),
      });
    } catch (syncError) {
      console.warn('Failed to sync alert to server:', syncError);
      // Non-critical error - continue even if sync fails
    }
  } catch (error) {
    console.error('Error saving price alert:', error);
  }
}

/**
 * Remove a price alert by ID
 */
export function removeAlert(alertId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const alerts = getAllAlerts();
    const filtered = alerts.filter(alert => alert.id !== alertId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error removing price alert:', error);
  }
}

/**
 * Check if an alert exists for a card
 */
export function hasAlert(cardName: string, scope: 'specific' | 'any', setName?: string, collectorNumber?: string): boolean {
  const alerts = getAllAlerts();
  return alerts.some(alert => {
    if (alert.cardName !== cardName) return false;
    if (scope === 'any' && alert.scope === 'any') return true;
    if (scope === 'specific' && alert.scope === 'specific') {
      return alert.setName === setName && alert.collectorNumber === collectorNumber;
    }
    return false;
  });
}

