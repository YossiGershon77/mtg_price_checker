'use server';

/**
 * Server action for price alerts
 * Note: For production, consider using a database or Vercel KV
 * This is a placeholder that validates input
 */

export interface SaveAlertInput {
  cardName: string;
  targetPrice: number;
  scope: 'specific' | 'any';
  setId?: string;
  setName?: string;
  collectorNumber?: string;
}

/**
 * Validate and save a price alert
 * @param alertData - The alert data to save
 * @returns Success status
 */
export async function saveAlert(alertData: SaveAlertInput): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate input
    if (!alertData.cardName || alertData.cardName.trim() === '') {
      return { success: false, error: 'Card name is required' };
    }

    if (!alertData.targetPrice || alertData.targetPrice <= 0) {
      return { success: false, error: 'Target price must be greater than 0' };
    }

    if (alertData.scope === 'specific' && (!alertData.setName || !alertData.collectorNumber)) {
      return { success: false, error: 'Set name and collector number are required for specific version alerts' };
    }

    // In a production environment, you would save to a database here
    // For now, we'll return success and the client-side code will handle storage
    // This allows the server action to validate the data
    
    return { success: true };
  } catch (error) {
    console.error('Error saving price alert:', error);
    return { success: false, error: 'Failed to save price alert' };
  }
}


