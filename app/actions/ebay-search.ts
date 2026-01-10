/**
 * Create or Update: app/actions/ebay-search.ts
 * This is the 'Sniper' function that searches for MTG cards on eBay.
 */

'use server';
import { getEbayToken } from '@/lib/ebay-auth';

export async function searchEbaySnipes(cardName: string) {
  const tokenResult = await getEbayToken();
  
  // Check if token request failed
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }
  
  // We use the 'Browse API' to find Buy It Now listings
  // Category 183454 = Magic: The Gathering
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.append('q', cardName);
  url.searchParams.append('category_ids', '183454');
  url.searchParams.append('filter', 'buyingOptions:{FIXED_PRICE},priceCurrency:USD');
  url.searchParams.append('sort', 'price'); // Cheapest first!
  url.searchParams.append('limit', '5');

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${tokenResult.token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("❌ EBAY API ERROR:", JSON.stringify(errorData, null, 2));
    console.log("DEBUG_EBAY_FULL_RESPONSE:", JSON.stringify(errorData, null, 2));
    return { success: false, error: errorData.error_description || "Unknown Error" };
  }

  const data = await response.json();
  
  // Clean up the data for our UI
  const results = data.itemSummaries?.map((item: any) => ({
    title: item.title,
    price: parseFloat(item.price.value),
    url: item.itemWebUrl,
    thumbnail: item.image?.imageUrl,
    condition: item.condition,
  })) || [];

  return { success: true, data: results };
}

/**
 * Get eBay sold history statistics for a card
 * @param cardName - The name of the card
 * @param setName - The set name (e.g., "Throne of Eldraine")
 * @param collectorNumber - The collector number
 * @param scryfallPrice - Optional Scryfall market price for outlier filtering
 * @returns Promise with average, median, and lowest sold prices, or error object
 */

interface ItemWithPrice {
  price: number;
  shipping: number;
  totalPrice: number;
}

export async function getEbaySoldHistory(
  cardName: string,
  setName: string,
  collectorNumber: string,
  scryfallPrice?: number | null
) {
  const tokenResult = await getEbayToken();
  
  // Check if token request failed
  if (!tokenResult.success) {
    return { success: false, error: tokenResult.error };
  }

  // Calculate date range for last 90 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  
  // Format dates as ISO 8601 strings
  const startDateStr = startDate.toISOString();
  const endDateStr = endDate.toISOString();

  // Try Marketplace Insights API first
  const insightsQuery = `${cardName} ${setName} ${collectorNumber} -proxy`;
  const insightsUrl = new URL('https://api.ebay.com/buy/marketplace_insights/v1/item_sales/search');
  insightsUrl.searchParams.append('q', insightsQuery);
  insightsUrl.searchParams.append('filter', `last_sold_date:[${startDateStr}..${endDateStr}]`);

  try {
    const insightsResponse = await fetch(insightsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${tokenResult.token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json',
      },
    });

    if (insightsResponse.ok) {
      const insightsData = await insightsResponse.json();
      const soldItems = insightsData.itemSales || insightsData.items || [];

      if (soldItems.length > 0) {
        // Extract prices with shipping
        const itemsWithPrices = soldItems
          .map((item: any) => {
            const itemPrice = item.price?.value || item.soldPrice?.value || item.finalPrice?.value || item.price;
            const shippingPrice = item.shippingCost?.value || item.shipping?.shippingCost?.value || 0;
            const price = itemPrice ? parseFloat(itemPrice) : null;
            const shipping = shippingPrice ? parseFloat(shippingPrice) : 0;
            const totalPrice = price !== null ? price + shipping : null;
            return { price, shipping, totalPrice };
          })
          .filter((item: any): item is ItemWithPrice => 
            item.totalPrice !== null && !isNaN(item.totalPrice)
          );

        // Filter outliers if Scryfall price is provided (remove items 3x higher or 3x lower)
        let cleanedItems: ItemWithPrice[] = itemsWithPrices;
        if (scryfallPrice && scryfallPrice > 0) {
          cleanedItems = itemsWithPrices.filter((item: ItemWithPrice) => {
            const ratio = item.totalPrice / scryfallPrice;
            return ratio >= 0.33 && ratio <= 3.0; // Between 1/3 and 3x
          });
        }

        if (cleanedItems.length > 0) {
          const totals = cleanedItems.map((item: ItemWithPrice) => item.totalPrice);
          const sortedTotals = [...totals].sort((a, b) => a - b);
          
          // Calculate average: price + shipping for each item, then average
          const totalValue = cleanedItems.reduce((sum, item) => sum + item.totalPrice, 0);
          const average = totalValue / cleanedItems.length;
          
          const median = sortedTotals.length % 2 === 0
            ? (sortedTotals[sortedTotals.length / 2 - 1] + sortedTotals[sortedTotals.length / 2]) / 2
            : sortedTotals[Math.floor(sortedTotals.length / 2)];
          const lowest = sortedTotals[0];

          // Debug logs
          console.log("📊 SOLD HISTORY CALCULATION (Marketplace Insights):");
          console.log(`Total Items Processed: ${cleanedItems.length}`);
          console.log(`Total Value: $${totalValue.toFixed(2)}`);
          console.log(`Calculated Average: $${average.toFixed(2)}`);

          return {
            success: true,
            data: {
              average: Number(average.toFixed(2)),
              median: Number(median.toFixed(2)),
              lowest: Number(lowest.toFixed(2)),
              count: cleanedItems.length,
            },
          };
        }
      }
    }
  } catch (error) {
    console.log("Marketplace Insights API failed, trying Browse API fallback...");
  }

  // Fallback to Browse API with sold date filter
  // Use card name + set only (no collector number) for broader results
  const browseQuery = `"${cardName}" "${setName}"`;
  const browseUrl = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  browseUrl.searchParams.append('q', browseQuery);
  browseUrl.searchParams.append('category_ids', '183454'); // MTG category
  browseUrl.searchParams.append('filter', `last_sold_date:[${startDateStr}..${endDateStr}]`);
  browseUrl.searchParams.append('limit', '50');

  try {
    const browseResponse = await fetch(browseUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${tokenResult.token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json',
      },
    });

    if (!browseResponse.ok) {
      const errorData = await browseResponse.json();
      console.error("❌ EBAY BROWSE API ERROR:", JSON.stringify(errorData, null, 2));
      return {
        success: true,
        data: {
          average: null,
          median: null,
          lowest: null,
          count: 0,
          message: "No recent sales found",
        },
      };
    }

    const browseData = await browseResponse.json();
    const items = browseData.itemSummaries || [];

    if (items.length === 0) {
      return {
        success: true,
        data: {
          average: null,
          median: null,
          lowest: null,
          count: 0,
          message: "No recent sales found",
        },
      };
    }

    // Extract prices with shipping from Browse API response
    const itemsWithPrices = items
      .map((item: any) => {
        const itemPrice = item.price?.value;
        const shippingPrice = item.shippingOptions?.[0]?.shippingCost?.value || 
                             item.shippingCost?.value || 
                             item.shipping?.shippingCost?.value || 
                             0;
        const price = itemPrice ? parseFloat(itemPrice) : null;
        const shipping = shippingPrice ? parseFloat(shippingPrice) : 0;
        const totalPrice = price !== null ? price + shipping : null;
        return { price, shipping, totalPrice };
      })
      .filter((item: any): item is { price: number; shipping: number; totalPrice: number } => 
        item.totalPrice !== null && !isNaN(item.totalPrice)
      );

    if (itemsWithPrices.length === 0) {
      return {
        success: true,
        data: {
          average: null,
          median: null,
          lowest: null,
          count: 0,
          message: "No recent sales found",
        },
      };
    }

    // Filter outliers if Scryfall price is provided (remove items 3x higher or 3x lower)
    let cleanedItems: ItemWithPrice[] = itemsWithPrices;
    if (scryfallPrice && scryfallPrice > 0) {
      cleanedItems = itemsWithPrices.filter((item: ItemWithPrice) => {
        const ratio = item.totalPrice / scryfallPrice;
        return ratio >= 0.33 && ratio <= 3.0; // Between 1/3 and 3x
      });
    }

    if (cleanedItems.length === 0) {
      return {
        success: true,
        data: {
          average: null,
          median: null,
          lowest: null,
          count: 0,
          message: "No recent sales found",
        },
      };
    }

    // Sort totals for median calculation
    const totals = cleanedItems.map((item: ItemWithPrice) => item.totalPrice);
    const sortedTotals = [...totals].sort((a, b) => a - b);

    // Calculate average: price + shipping for each item, then average
    const totalValue = cleanedItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const average = totalValue / cleanedItems.length;
    
    const median = sortedTotals.length % 2 === 0
      ? (sortedTotals[sortedTotals.length / 2 - 1] + sortedTotals[sortedTotals.length / 2]) / 2
      : sortedTotals[Math.floor(sortedTotals.length / 2)];
    const lowest = sortedTotals[0];

    // Debug logs
    console.log("📊 SOLD HISTORY CALCULATION (Browse API):");
    console.log(`Total Items Processed: ${cleanedItems.length}`);
    console.log(`Total Value: $${totalValue.toFixed(2)}`);
    console.log(`Calculated Average: $${average.toFixed(2)}`);

    return {
      success: true,
      data: {
        average: Number(average.toFixed(2)),
        median: Number(median.toFixed(2)),
        lowest: Number(lowest.toFixed(2)),
        count: cleanedItems.length,
      },
    };
  } catch (error) {
    console.error("❌ EBAY SOLD HISTORY ERROR:", error);
    return {
      success: true,
      data: {
        average: null,
        median: null,
        lowest: null,
        count: 0,
        message: "No recent sales found",
      },
    };
  }
}
