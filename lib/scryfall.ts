/**
 * Scryfall API client for Magic: The Gathering card data
 * Documentation: https://scryfall.com/docs/api
 */

// Card prices interface
export interface CardPrices {
  usd: string | null;
  usd_foil: string | null;
  usd_etched: string | null;
  eur: string | null;
  eur_foil: string | null;
  tix: string | null;
  tcgplayer_id?: number;
}

// TCGPlayer prices interface
export interface TCGPlayerPrices {
  url: string;
  updated_at: string;
  prices?: {
    normal?: { low?: number; mid?: number; high?: number; market?: number; directLow?: number };
    holofoil?: { low?: number; mid?: number; high?: number; market?: number; directLow?: number };
    reverseHolofoil?: { low?: number; mid?: number; high?: number; market?: number; directLow?: number };
  };
}

// Card interface based on Scryfall API schema
export interface Card {
  id: string;
  oracle_id: string;
  multiverse_ids: number[];
  mtgo_id?: number;
  mtgo_foil_id?: number;
  tcgplayer_id?: number;
  cardmarket_id?: number;
  name: string;
  lang: string;
  released_at: string;
  uri: string;
  scryfall_uri: string;
  layout: string;
  highres_image: boolean;
  image_status: string;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    png: string;
    art_crop: string;
    border_crop: string;
  };
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors: string[];
  color_identity: string[];
  keywords: string[];
  legalities: {
    standard: string;
    future: string;
    historic: string;
    gladiator: string;
    pioneer: string;
    explorer: string;
    modern: string;
    legacy: string;
    pauper: string;
    vintage: string;
    penny: string;
    commander: string;
    oathbreaker: string;
    brawl: string;
    historicbrawl: string;
    alchemy: string;
    paupercommander: string;
    duel: string;
    oldschool: string;
    premodern: string;
    predh: string;
  };
  games: string[];
  reserved: boolean;
  foil: boolean;
  nonfoil: boolean;
  finishes: string[];
  oversized: boolean;
  promo: boolean;
  reprint: boolean;
  variation: boolean;
  set_id: string;
  set: string;
  set_name: string;
  set_type: string;
  set_uri: string;
  set_search_uri: string;
  scryfall_set_uri: string;
  rulings_uri: string;
  prints_search_uri: string;
  collector_number: string;
  digital: boolean;
  rarity: string;
  card_back_id: string;
  artist?: string;
  artist_ids: string[];
  illustration_id?: string;
  border_color: string;
  frame: string;
  frame_effects?: string[];
  security_stamp?: string;
  full_art: boolean;
  textless: boolean;
  booster: boolean;
  story_spotlight: boolean;
  edhrec_rank?: number;
  penny_rank?: number;
  prices: CardPrices;
  related_uris: {
    gatherer?: string;
    tcgplayer_infinite_articles?: string;
    tcgplayer_infinite_decks?: string;
    edhrec?: string;
    mtgtop8?: string;
  };
  purchase_uris?: {
    tcgplayer?: string;
    cardmarket?: string;
    cardhoarder?: string;
  };
}

// Search response interface
export interface ScryfallSearchResponse {
  object: 'list';
  total_cards: number;
  has_more: boolean;
  next_page?: string;
  data: Card[];
}

// Card price response interface
export interface CardPriceResponse {
  usd: string | null;
  usd_foil: string | null;
  tcgplayer?: TCGPlayerPrices;
}

const SCRYFALL_API_BASE = 'https://api.scryfall.com';

/**
 * Search for cards using Scryfall's search API
 * @param query - Search query string (supports Scryfall syntax)
 * @returns Promise<Card[]> - Array of card objects
 */
export async function searchCards(query: string): Promise<Card[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `${SCRYFALL_API_BASE}/cards/search?q=${encodedQuery}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        // No cards found
        return [];
      }
      throw new Error(`Scryfall API error: ${response.status} ${response.statusText}`);
    }
    
    const data: ScryfallSearchResponse = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error searching cards:', error);
    throw error;
  }
}

/**
 * Get card prices by Scryfall card ID
 * @param id - Scryfall card ID
 * @returns Promise<CardPriceResponse> - Object containing USD, Foil, and TCGPlayer prices
 */
export async function getCardPrices(id: string): Promise<CardPriceResponse> {
  try {
    const url = `${SCRYFALL_API_BASE}/cards/${id}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Scryfall API error: ${response.status} ${response.statusText}`);
    }
    
    const card: Card = await response.json();
    
    return {
      usd: card.prices.usd,
      usd_foil: card.prices.usd_foil,
      tcgplayer: card.tcgplayer_id
        ? {
            url: card.purchase_uris?.tcgplayer || '',
            updated_at: card.released_at,
          }
        : undefined,
    };
  } catch (error) {
    console.error('Error fetching card prices:', error);
    throw error;
  }
}

/**
 * Fetch a card by name and return its details with USD market price
 * @param cardName - The name of the card to search for
 * @returns Promise with card details including id, name, set, image, and market_price
 */
export async function fetchCardByName(cardName: string): Promise<{
  id: string;
  name: string;
  set: string;
  image: string;
  market_price: number | null;
  prices: {
    usd: number | null;
    usd_foil: number | null;
  };
}> {
  try {
    // Search for the card by exact name
    const encodedQuery = encodeURIComponent(`!"${cardName}"`);
    const url = `${SCRYFALL_API_BASE}/cards/search?q=${encodedQuery}&order=released&dir=desc&unique=prints`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Card not found: ${cardName}`);
      }
      throw new Error(`Scryfall API error: ${response.status} ${response.statusText}`);
    }
    
    const data: ScryfallSearchResponse = await response.json();
    
    if (data.data.length === 0) {
      throw new Error(`Card not found: ${cardName}`);
    }
    
    // Get the most recent printing (first result)
    const card = data.data[0];
    
    // Parse USD market price (could be null, or a string like "1.50")
    const marketPrice = card.prices.usd ? parseFloat(card.prices.usd) : null;
    const foilPrice = card.prices.usd_foil ? parseFloat(card.prices.usd_foil) : null;
    
    return {
      id: card.id,
      name: card.name,
      set: card.set_name,
      image: card.image_uris?.normal || card.image_uris?.large || card.image_uris?.small || '',
      market_price: marketPrice,
      prices: {
        usd: marketPrice,
        usd_foil: foilPrice,
      },
    };
  } catch (error) {
    console.error('Error fetching card by name:', error);
    throw error;
  }
}

