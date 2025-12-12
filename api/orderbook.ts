import type { VercelRequest, VercelResponse } from '@vercel/node';

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
    // Add 2-second delay to avoid exposing real-time orderbook levels
    await new Promise(resolve => setTimeout(resolve, 2000));

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

    const data = await apiResponse.json();
    
    // Return the data with CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    return response.status(200).json(data);
  } catch (error) {
    console.error('Error fetching orderbook:', error);
    return response.status(500).json({ 
      error: 'Internal server error' 
    });
  }
}

