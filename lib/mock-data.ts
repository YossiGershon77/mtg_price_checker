/**
 * Mock data generator for development and testing
 * Generates historical transaction data for cards
 */

export interface MockTransaction {
  date: string;
  price: number;
  source: 'eBay Auction' | 'eBay Buy It Now' | 'TCGPlayer Sale';
  condition: 'Near Mint' | 'Lightly Played';
}

const SOURCES: MockTransaction['source'][] = [
  'eBay Auction',
  'eBay Buy It Now',
  'TCGPlayer Sale',
];

const CONDITIONS: MockTransaction['condition'][] = [
  'Near Mint',
  'Lightly Played',
];

/**
 * Generate mock historical transaction data
 * @param basePrice - The base price to use for generating fluctuations
 * @returns Array of 50 mock transaction objects
 */
export function generateMockHistory(basePrice: number): MockTransaction[] {
  const transactions: MockTransaction[] = [];
  const now = new Date();
  
  for (let i = 0; i < 50; i++) {
    // Generate a random date within the last 30 days
    const daysAgo = Math.floor(Math.random() * 30);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    
    // Format date as YYYY-MM-DD
    const dateString = date.toISOString().split('T')[0];
    
    // Generate price with 5-10% random fluctuation
    // Randomly choose between -10% to +10% (but ensure at least 5% variance)
    const fluctuationPercent = 0.05 + Math.random() * 0.05; // 5% to 10%
    const isPositive = Math.random() > 0.5;
    const fluctuation = isPositive ? fluctuationPercent : -fluctuationPercent;
    const price = basePrice * (1 + fluctuation);
    
    // Round price to 2 decimal places
    const roundedPrice = Math.round(price * 100) / 100;
    
    // Randomly select source and condition
    const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
    const condition = CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)];
    
    transactions.push({
      date: dateString,
      price: roundedPrice,
      source,
      condition,
    });
  }
  
  // Sort by date (most recent first)
  return transactions.sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });
}




