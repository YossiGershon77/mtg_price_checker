import { NextRequest, NextResponse } from 'next/server';
import { addWatchlistItem, getAllWatchlistItems, saveWatchlistItems } from '@/lib/watchlist-storage';

/**
 * POST /api/watchlist/save
 * Save a watchlist item to watchlist.json
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cardName, cardId, targetPrice, scope, setName, collectorNumber } = body;

    // Validate input
    if (!cardName || cardName.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Card name is required' },
        { status: 400 }
      );
    }

    if (!cardId || cardId.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Card ID is required' },
        { status: 400 }
      );
    }

    if (!targetPrice || targetPrice <= 0) {
      return NextResponse.json(
        { success: false, error: 'Target price must be greater than 0' },
        { status: 400 }
      );
    }

    if (scope !== 'specific' && scope !== 'any') {
      return NextResponse.json(
        { success: false, error: 'Scope must be "specific" or "any"' },
        { status: 400 }
      );
    }

    if (scope === 'specific' && (!setName || !collectorNumber)) {
      return NextResponse.json(
        { success: false, error: 'Set name and collector number are required for specific scope' },
        { status: 400 }
      );
    }

    // Add the watchlist item
    const item = await addWatchlistItem({
      cardName,
      cardId,
      targetPrice,
      scope,
      setName: scope === 'specific' ? setName : undefined,
      collectorNumber: scope === 'specific' ? collectorNumber : undefined,
    });

    return NextResponse.json({
      success: true,
      item,
    });
  } catch (error) {
    console.error('Error saving watchlist item:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save watchlist item',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/watchlist/save
 * Get all watchlist items
 */
export async function GET() {
  try {
    const items = await getAllWatchlistItems();
    return NextResponse.json({
      success: true,
      items,
    });
  } catch (error) {
    console.error('Error fetching watchlist items:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch watchlist items',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



