import type { VercelRequest, VercelResponse } from '@vercel/node';

interface OrderbookEntry {
  base_symbol: string;
  quote_symbol: string;
  base_address: string;
  quote_address: string;
  side: 'bid' | 'ask';
  levels: [number, number][];
}

/**
 * Compress levels based on price impact percentages (0.1%, 0.5%, 2%)
 * Price impact is calculated relative to mid price
 */
function compressLevelsByPriceImpact(
  levels: [number, number][],
  midPrice: number,
  side: 'bid' | 'ask'
): [number, number][] {
  if (levels.length === 0) {
    return [];
  }

  // Price impact percentages: 0.1%, 0.5%, 2%
  const priceImpacts = [0.001, 0.005, 0.02];
  
  const compressed: [number, number][] = [];

  for (const impact of priceImpacts) {
    let accumulatedAmount = 0;
    let accumulatedSum = 0; // sum of (amount * price)
    let hasLevels = false;

    // Calculate target price based on side
    let targetPrice: number;
    if (side === 'bid') {
      // For bids: price should be below mid (negative impact)
      targetPrice = midPrice * (1 - impact);
    } else {
      // For asks: price should be above mid (positive impact)
      targetPrice = midPrice * (1 + impact);
    }

    // Find all levels within the price impact range
    // For bids: prices <= targetPrice (prices below or equal to target)
    // For asks: prices >= targetPrice (prices above or equal to target)
    for (const [amount, price] of levels) {
      const isInRange = side === 'bid' 
        ? price <= targetPrice && price > midPrice * (1 - impact * 2) // Prevent overlap with larger impacts
        : price >= targetPrice && price < midPrice * (1 + impact * 2); // Prevent overlap with larger impacts
      
      if (isInRange) {
        accumulatedAmount += amount;
        accumulatedSum += price * amount;
        hasLevels = true;
      }
    }

    // Only add if we found levels in this range
    if (hasLevels && accumulatedAmount > 0) {
      const compressedPrice = accumulatedSum / accumulatedAmount;
      compressed.push([accumulatedAmount, compressedPrice]);
    }
  }

  return compressed;
}

/**
 * Calculate mid price from best bid and best ask
 * If there's no other side, use the first level's price as mid price
 */
function calculateMidPrice(bidEntry: OrderbookEntry | null, askEntry: OrderbookEntry | null, currentEntry: OrderbookEntry): number | null {
  // If both sides exist, calculate mid price from best bid and best ask
  if (bidEntry && askEntry && bidEntry.levels.length > 0 && askEntry.levels.length > 0) {
    // Best bid is the highest price (first level for bids, typically sorted descending)
    const bestBid = bidEntry.levels[0][1];
    
    // Best ask is the lowest price (first level for asks, typically sorted ascending)
    const bestAsk = askEntry.levels[0][1];

    return (bestBid + bestAsk) / 2;
  }

  // If there's no other side, use the first level's price as mid price
  if (currentEntry.levels.length > 0) {
    return currentEntry.levels[0][1];
  }

  return null;
}

/**
 * Reshape orderbook data by compressing levels based on price impact
 */
function reshapeOrderbook(data: OrderbookEntry[]): OrderbookEntry[] {
  // Group entries by pair (base_symbol/quote_symbol and addresses)
  const pairMap = new Map<string, { bid: OrderbookEntry | null; ask: OrderbookEntry | null }>();

  // First pass: group entries by pair
  for (const entry of data) {
    const pairKey = `${entry.base_symbol}/${entry.quote_symbol}:${entry.base_address}/${entry.quote_address}`;
    
    if (!pairMap.has(pairKey)) {
      pairMap.set(pairKey, { bid: null, ask: null });
    }
    
    const pair = pairMap.get(pairKey)!;
    if (entry.side === 'bid') {
      pair.bid = entry;
    } else {
      pair.ask = entry;
    }
  }

  // Second pass: compress levels for each entry based on mid price
  const result: OrderbookEntry[] = [];

  for (const entry of data) {
    const pairKey = `${entry.base_symbol}/${entry.quote_symbol}:${entry.base_address}/${entry.quote_address}`;
    const pair = pairMap.get(pairKey);
    
    if (!pair) continue;

    // Calculate mid price
    const midPrice = calculateMidPrice(pair.bid, pair.ask, entry);
    
    if (midPrice === null) {
      // If we can't calculate mid price, return original levels
      result.push(entry);
      continue;
    }

    // Compress levels based on price impact
    const compressedLevels = compressLevelsByPriceImpact(entry.levels, midPrice, entry.side);
    
    result.push({
      ...entry,
      levels: compressedLevels
    });
  }

  return result;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  // Only allow GET requests
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  // Get chain from query parameter
  const chain = request.query.chain as string;
  
  if (!chain) {
    return response.status(400).json({ error: 'Chain parameter is required' });
  }

  // Get API key from environment variable (set in Vercel dashboard)
  const API_KEY = process.env.NATIVE_API_KEY;
  
  if (!API_KEY) {
    return response.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Add random delay between 0-10 seconds to avoid exposing exact timing
    const randomDelay = Math.random() * 10000; // 0 to 10000ms
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    // Fetch from Native API
    const apiResponse = await fetch(
      `https://v2.api.native.org/swap-api-v2/v1/orderbook?chain=${chain}`,
      {
        headers: {
          'apiKey': API_KEY
        }
      }
    );

    if (!apiResponse.ok) {
      return response.status(apiResponse.status).json({ 
        error: 'Failed to fetch orderbook data' 
      });
    }

    const data: OrderbookEntry[] = await apiResponse.json();
    
    // Reshape and compress the orderbook levels
    const reshapedData = reshapeOrderbook(data);
    
    // Return the data with CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    return response.status(200).json(reshapedData);
  } catch (error) {
    console.error('Error fetching orderbook:', error);
    return response.status(500).json({ 
      error: 'Internal server error' 
    });
  }
}

