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

  // Sum all amounts
  const totalAmount = levels.reduce((sum, [, amount]) => sum + amount, 0);
  
  // Calculate amount threshold per level
  const amountPerLevel = totalAmount / targetCount;

  const compressed: [number, number][] = [];
  let levelIndex = 0;
  let accumulatedAmount = 0;
  let weightedPriceSum = 0;

  for (let i = 0; i < levels.length && levelIndex < targetCount; i++) {
    const [price, amount] = levels[i];
    const remainingForCurrentLevel = amountPerLevel - accumulatedAmount;
    
    if (amount <= remainingForCurrentLevel) {
      // This level fits entirely in the current bucket
      weightedPriceSum += price * amount;
      accumulatedAmount += amount;
      
      // Check if we've reached the threshold (or this is the last level)
      if (accumulatedAmount >= amountPerLevel - 1e-10 || i === levels.length - 1) {
        const avgPrice = accumulatedAmount > 0 ? weightedPriceSum / accumulatedAmount : price;
        compressed.push([avgPrice, accumulatedAmount]);
        
        // Reset for next level
        accumulatedAmount = 0;
        weightedPriceSum = 0;
        levelIndex++;
      }
    } else {
      // This level spans multiple buckets
      // First, complete the current bucket with part of this level
      const amountForCurrentBucket = remainingForCurrentLevel;
      weightedPriceSum += price * amountForCurrentBucket;
      accumulatedAmount += amountForCurrentBucket;
      
      // Complete current bucket
      const avgPrice = accumulatedAmount > 0 ? weightedPriceSum / accumulatedAmount : price;
      compressed.push([avgPrice, accumulatedAmount]);
      
      // Reset for next level
      let remainingAmount = amount - amountForCurrentBucket;
      accumulatedAmount = 0;
      weightedPriceSum = 0;
      levelIndex++;
      
      // Fill remaining buckets with the rest of this level
      while (remainingAmount > 0 && levelIndex < targetCount) {
        const amountForThisBucket = Math.min(remainingAmount, amountPerLevel);
        weightedPriceSum += price * amountForThisBucket;
        accumulatedAmount = amountForThisBucket;
        remainingAmount -= amountForThisBucket;
        
        // Complete this bucket if we've reached the threshold or used all remaining amount
        if (accumulatedAmount >= amountPerLevel - 1e-10 || remainingAmount === 0) {
          const avgPrice = accumulatedAmount > 0 ? weightedPriceSum / accumulatedAmount : price;
          compressed.push([avgPrice, accumulatedAmount]);
          
          if (levelIndex < targetCount - 1) {
            accumulatedAmount = 0;
            weightedPriceSum = 0;
            levelIndex++;
          }
        }
      }
    }
  }

  // Handle any remaining accumulated amount (shouldn't happen, but safety check)
  if (accumulatedAmount > 1e-10 && compressed.length < targetCount) {
    const avgPrice = accumulatedAmount > 0 ? weightedPriceSum / accumulatedAmount : levels[levels.length - 1][0];
    compressed.push([avgPrice, accumulatedAmount]);
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

