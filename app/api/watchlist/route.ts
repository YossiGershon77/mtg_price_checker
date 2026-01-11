import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

interface WatchlistItem {
  id: string;
  cardName: string;
  targetPrice: number;
  setName?: string;
  createdAt: string;
}

/**
 * GET /api/watchlist
 * Fetch all watchlist items from Upstash Redis
 */
export async function GET() {
  try {
    const watchlist: WatchlistItem[] = (await redis.get('watchlist')) || [];
    
    return NextResponse.json({
      success: true,
      items: watchlist,
    });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
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

/**
 * POST /api/watchlist
 * Add a card to the watchlist in Upstash Redis
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cardName, targetPrice, setName } = body;

    // Validate input
    if (!cardName || cardName.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Card name is required' },
        { status: 400 }
      );
    }

    if (!targetPrice || targetPrice <= 0) {
      return NextResponse.json(
        { success: false, error: 'Target price must be greater than 0' },
        { status: 400 }
      );
    }

    // Get existing watchlist
    const watchlist: WatchlistItem[] = (await redis.get('watchlist')) || [];

    // Create new item
    const newItem: WatchlistItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      cardName: cardName.trim(),
      targetPrice: parseFloat(targetPrice),
      setName: setName ? setName.trim() : undefined,
      createdAt: new Date().toISOString(),
    };

    // Add to watchlist
    watchlist.push(newItem);

    // Save to Redis
    await redis.set('watchlist', watchlist);

    return NextResponse.json({
      success: true,
      item: newItem,
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
 * DELETE /api/watchlist
 * Remove a card from the watchlist by ID
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID parameter is required' },
        { status: 400 }
      );
    }

    // Get existing watchlist
    const watchlist: WatchlistItem[] = (await redis.get('watchlist')) || [];

    // Filter out the item with the matching ID
    const filteredWatchlist = watchlist.filter(item => item.id !== id);

    // Check if item was found
    if (filteredWatchlist.length === watchlist.length) {
      return NextResponse.json(
        { success: false, error: 'Item not found' },
        { status: 404 }
      );
    }

    // Save to Redis
    await redis.set('watchlist', filteredWatchlist);

    return NextResponse.json({
      success: true,
      message: 'Item removed successfully',
    });
  } catch (error) {
    console.error('Error deleting watchlist item:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete watchlist item',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

