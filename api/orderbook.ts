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
 * Compress levels based on price impact percentages
 * Final results: < 0.1%, < 1%, >= 1%
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

  // If there's only one original level, return as is
  if (levels.length === 1) {
    return levels;
  }

  // Three buckets: < 0.1%, < 1%, >= 1%
  const thresholds = [0.001, 0.01]; // 0.1%, 1%
  
  // Initialize accumulators for each bucket
  const buckets: Array<{ amount: number; sum: number }> = [
    { amount: 0, sum: 0 }, // < 0.1%
    { amount: 0, sum: 0 }, // >= 0.1% and < 1%
    { amount: 0, sum: 0 }  // >= 1%
  ];

  // Loop through original levels
  for (const [amount, price] of levels) {
    // Calculate price impact
    let priceImpact: number;
    if (side === 'bid') {
      // For bids: impact is positive when price < mid (we're buying below mid)
      priceImpact = (midPrice - price) / midPrice;
    } else {
      // For asks: impact is positive when price > mid (we're selling above mid)
      priceImpact = (price - midPrice) / midPrice;
    }

    // Determine which bucket this level belongs to
    if (priceImpact < thresholds[0]) {
      // < 0.1%
      buckets[0].amount += amount;
      buckets[0].sum += price * amount;
    } else if (priceImpact < thresholds[1]) {
      // >= 0.1% and < 1%
      buckets[1].amount += amount;
      buckets[1].sum += price * amount;
    } else {
      // >= 1%
      buckets[2].amount += amount;
      buckets[2].sum += price * amount;
    }
  }

  // Build compressed levels from buckets
  const compressed: [number, number][] = [];

  // Bucket 1: < 0.1%
  if (buckets[0].amount > 0) {
    const compressedPrice = buckets[0].sum / buckets[0].amount;
    compressed.push([buckets[0].amount, compressedPrice]);
  }

  // Bucket 2: >= 0.1% and < 1%
  if (buckets[1].amount > 0) {
    const compressedPrice = buckets[1].sum / buckets[1].amount;
    compressed.push([buckets[1].amount, compressedPrice]);
  }

  // Bucket 3: >= 1%
  if (buckets[2].amount > 0) {
    const compressedPrice = buckets[2].sum / buckets[2].amount;
    compressed.push([buckets[2].amount, compressedPrice]);
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

