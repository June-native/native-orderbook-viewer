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
 * Compress orderbook levels according to obfuscation rules:
 * - 1 level: return as is
 * - 2-5 levels: compress to 2 levels
 * - >5 levels: compress to 3 levels
 */
function compressLevels(levels: [number, number][]): [number, number][] {
  if (levels.length === 0) {
    return [];
  }

  // 1 level: return as is
  if (levels.length === 1) {
    return levels;
  }

  // Determine target level count
  let targetCount: number;
  if (levels.length >= 2 && levels.length <= 5) {
    targetCount = 2;
  } else {
    targetCount = 3;
  }

  // If already at or below target, return as is
  if (levels.length <= targetCount) {
    return levels;
  }

  // Calculate how many original levels per compressed level
  const levelsPerCompressed = levels.length / targetCount;

  const compressed: [number, number][] = [];
  let accumulatedAmount = 0;
  let accumulatedSum = 0; // sum of (amount * price)
  let levelCount = 0; // count of original levels in current group

  // Loop through original levels from top to bottom
  for (let i = 0; i < levels.length; i++) {
    const [amount, price] = levels[i];
    
    // Accumulate amount and sum (amount * price)
    accumulatedAmount += amount;
    accumulatedSum += price * amount;
    levelCount++;
    
    // Check if we've accumulated enough levels (or this is the last level)
    const shouldCreateLevel = levelCount >= levelsPerCompressed - 1e-10 || i === levels.length - 1;
    
    if (shouldCreateLevel) {
      // Generate compressed level: price = accumulatedSum / accumulatedAmount, amount = accumulatedAmount
      const compressedPrice = accumulatedAmount > 0 ? accumulatedSum / accumulatedAmount : price;
      compressed.push([accumulatedAmount, compressedPrice]);
      
      // Reset for next compressed level
      accumulatedAmount = 0;
      accumulatedSum = 0;
      levelCount = 0;
      
      // Stop if we've reached the target count
      if (compressed.length >= targetCount) {
        break;
      }
    }
  }

  return compressed;
}

/**
 * Reshape orderbook data by compressing levels for each entry
 */
function reshapeOrderbook(data: OrderbookEntry[]): OrderbookEntry[] {
  return data.map(entry => ({
    ...entry,
    levels: compressLevels(entry.levels)
  }));
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

