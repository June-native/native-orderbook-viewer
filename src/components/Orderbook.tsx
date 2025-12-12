import { useEffect, useState, useRef } from 'react';
import './Orderbook.css';

interface OrderbookEntry {
  base_symbol: string;
  quote_symbol: string;
  base_address: string;
  quote_address: string;
  side: 'bid' | 'ask';
  levels: [number, number][];
}

type Chain = 'ethereum' | 'bsc' | 'arbitrum' | 'base';

// API key from environment variable
const API_KEY = import.meta.env.VITE_API_KEY || '';

const Orderbook = () => {
  const [orderbookData, setOrderbookData] = useState<OrderbookEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<Chain>('ethereum');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAutoUpdate, setIsAutoUpdate] = useState(true);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; price: number; cumulative: number; side: 'bid' | 'ask' } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isInitialMount = useRef(true);

  // Helper to encode pair for URL (replace / with -)
  const encodePair = (pair: string | null): string | null => {
    if (!pair) return null;
    return pair.replace(/\//g, '-');
  };

  // Helper to decode pair from URL (replace - with /)
  const decodePair = (pair: string | null): string | null => {
    if (!pair) return null;
    return pair.replace(/-/g, '/');
  };

  // Read URL parameters on initial load (runs once on mount)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlChain = params.get('chain') as Chain | null;
    const urlPairEncoded = params.get('pair');
    const urlPair = decodePair(urlPairEncoded);
    
    if (urlChain && ['ethereum', 'bsc', 'arbitrum', 'base'].includes(urlChain)) {
      setSelectedChain(urlChain);
    }
    if (urlPair) {
      setSelectedPair(urlPair);
    }
    isInitialMount.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Update URL when chain or pair changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) return;
    
    const params = new URLSearchParams(window.location.search);
    
    if (selectedChain) {
      params.set('chain', selectedChain);
    } else {
      params.delete('chain');
    }
    
    if (selectedPair) {
      const encodedPair = encodePair(selectedPair);
      if (encodedPair) {
        params.set('pair', encodedPair);
      } else {
        params.delete('pair');
      }
    } else {
      params.delete('pair');
    }
    
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newUrl);
  }, [selectedChain, selectedPair]);

  // Update page title when chain or pair changes
  useEffect(() => {
    const title = selectedPair 
      ? `${selectedChain.toUpperCase()} - ${selectedPair}`
      : `${selectedChain.toUpperCase()}`;
    document.title = title;
  }, [selectedChain, selectedPair]);

  const fetchOrderbook = async () => {
    try {
      // Use Vercel proxy endpoint (or fallback to direct API in development)
      const apiUrl = import.meta.env.PROD 
        ? `/api/orderbook?chain=${selectedChain}`
        : `https://v2.api.native.org/swap-api-v2/v1/orderbook?chain=${selectedChain}`;
      
      const headers: HeadersInit = import.meta.env.PROD
        ? {}
        : { 'apiKey': API_KEY };
      
      const response = await fetch(apiUrl, { headers });
      
      if (!response.ok) {
        throw new Error('Failed to fetch orderbook data');
      }

      const data = await response.json();
      setOrderbookData(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Effect for initial pair selection and chain changes
  useEffect(() => {
    const initializePairs = async () => {
      try {
        // Use Vercel proxy endpoint (or fallback to direct API in development)
        const apiUrl = import.meta.env.PROD 
          ? `/api/orderbook?chain=${selectedChain}`
          : `https://v2.api.native.org/swap-api-v2/v1/orderbook?chain=${selectedChain}`;
        
        const headers: HeadersInit = import.meta.env.PROD
          ? {}
          : { 'apiKey': API_KEY };
        
        const response = await fetch(apiUrl, { headers });
        
        if (!response.ok) {
          throw new Error('Failed to fetch orderbook data');
        }

        const data = await response.json();
        setOrderbookData(data);
        
        // Get available pairs
        const availablePairs = new Set<string>();
        data.forEach((entry: OrderbookEntry) => {
          if (entry.side === 'bid') {
            availablePairs.add(`${entry.base_symbol}/${entry.quote_symbol}`);
          }
        });
        const pairsArray = Array.from(availablePairs);
        
        // Check if current pair exists, if not, use first pair or default
        if (selectedPair && pairsArray.includes(selectedPair)) {
          // Pair exists, keep it
        } else if (pairsArray.length > 0) {
          // Pair doesn't exist or not set, use first available pair
          setSelectedPair(pairsArray[0]);
        } else {
          setSelectedPair(null);
        }
        
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setSelectedPair(null);
      } finally {
        setLoading(false);
      }
    };

    initializePairs();
  }, [selectedChain]); // Only run when chain changes

  // Effect for auto-refresh
  useEffect(() => {
    if (!isAutoUpdate) return;

    const interval = setInterval(fetchOrderbook, 2000);
    return () => clearInterval(interval);
  }, [selectedChain, isAutoUpdate]); // Add isAutoUpdate as dependency

  // Helper to identify stable tokens
  const isStableToken = (symbol: string): boolean => {
    return symbol === 'USDT' || symbol === 'USDC';
  };

  const getSelectedPairData = () => {
    if (!selectedPair) return null;
    const [base, quote] = selectedPair.split('/');
    
    // Identify which token is stable and which is non-stable
    const baseIsStable = isStableToken(base);
    const quoteIsStable = isStableToken(quote);
    
    // Determine stable and non-stable tokens
    let stableToken: string;
    let nonStableToken: string;
    
    if (baseIsStable && !quoteIsStable) {
      stableToken = base;
      nonStableToken = quote;
    } else if (!baseIsStable && quoteIsStable) {
      stableToken = quote;
      nonStableToken = base;
    } else {
      // If both or neither are stable, fall back to original logic
      stableToken = base;
      nonStableToken = quote;
    }
    
    // Top part (asks/buying): base=stable, quote=non-stable
    // This means we're buying non-stable token with stable token
    const askEntry = orderbookData.find(entry => 
      entry.base_symbol === stableToken && 
      entry.quote_symbol === nonStableToken && 
      entry.side === 'bid'
    );

    // Bottom part (bids/selling): base=non-stable, quote=stable
    // This means we're selling non-stable token for stable token
    const bidEntry = orderbookData.find(entry => 
      entry.base_symbol === nonStableToken && 
      entry.quote_symbol === stableToken && 
      entry.side === 'bid'
    );

    return { bidEntry, askEntry, stableToken, nonStableToken };
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return num.toFixed(8);
  };

  // Get unique trading pairs
  const getUniquePairs = () => {
    const pairs = new Set<string>();
    const seenTokens = new Set<string>();
    
    orderbookData.forEach(entry => {
      if (entry.side === 'bid') {
        const tokenPair = [entry.base_symbol, entry.quote_symbol].sort().join('/');
        if (!seenTokens.has(tokenPair)) {
          seenTokens.add(tokenPair);
          pairs.add(`${entry.base_symbol}/${entry.quote_symbol}`);
        }
      }
    });
    
    return Array.from(pairs);
  };

  // Effect to scroll to middle after data updates (no longer needed with separate sections)
  // Removed scrollToMiddle as we now have separate scrolling sections

  if (loading) {
    return <div className="loading">Loading orderbook...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const selectedData = getSelectedPairData();
  
  // Process bids (bottom/selling): base=non-stable, quote=stable
  // Use price directly, sort descending (highest price first)
  const rawBids = selectedData?.bidEntry?.levels || [];
  const bids = [...rawBids].sort((a, b) => b[1] - a[1]); // Sort by price descending
  
  // Process asks (top/buying): base=stable, quote=non-stable
  // Flip price with 1/price, sort ascending (lowest price first) for graph
  const rawAsks = selectedData?.askEntry?.levels || [];
  const asks = rawAsks.map(([amount, price]) => [amount, 1 / price] as [number, number])
    .sort((a, b) => a[1] - b[1]); // Sort by flipped price ascending for graph
  
  // Sort asks descending for display (highest price first)
  const asksForDisplay = [...asks].sort((a, b) => b[1] - a[1]); // Sort by flipped price descending

  // Calculate mid price and spread
  const calculateMidPriceAndSpread = () => {
    if (asks.length === 0 || bids.length === 0) return null;
    
    const bestAsk = asks[0][1]; // Lowest ask price (first in ascending order for graph)
    const bestBid = bids[0][1]; // Highest bid price (first in descending order)
    
    const midPrice = (bestAsk + bestBid) / 2;
    const spread = bestAsk - bestBid;
    const spreadPercent = (spread / midPrice) * 100;
    
    return { midPrice, spread, spreadPercent };
  };

  const midPriceData = calculateMidPriceAndSpread();

  // Calculate depth map data
  const calculateDepthData = () => {
    if (bids.length === 0 && asks.length === 0) return null;

    // Process bids (bottom/selling): [amount, price] -> cumulative amounts
    // Price is already correct (base=non-stable, quote=stable)
    const bidData: { price: number; cumulative: number }[] = [];
    let bidCumulative = 0;
    bids.forEach(([amount, price]) => {
      bidCumulative += amount;
      bidData.push({ price, cumulative: bidCumulative });
    });

    // Process asks (top/buying): [amount, price] -> cumulative amounts
    // Price is already flipped (1/price was applied)
    const askData: { price: number; cumulative: number }[] = [];
    let askCumulative = 0;
    asks.forEach(([amount, price]) => {
      // For asks: amount from API is in stable token (base), price is flipped (1/original_price)
      // To get amount in non-stable token: amount * original_price = amount / flipped_price
      const originalPrice = 1 / price; // Reverse the flip to get original price
      const displayAmount = amount * originalPrice; // Convert to non-stable token amount
      askCumulative += displayAmount;
      askData.push({ price, cumulative: askCumulative });
    });

    // Get price range
    const allPrices = [
      ...bidData.map(d => d.price),
      ...askData.map(d => d.price)
    ];
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice;

    // Get max cumulative for Y-axis
    const maxCumulative = Math.max(
      ...bidData.map(d => d.cumulative),
      ...askData.map(d => d.cumulative)
    );

    return {
      bidData,
      askData,
      minPrice,
      maxPrice,
      priceRange,
      maxCumulative,
      leftPadding: 50,
      rightPadding: 50,
      chartWidth: 300 // 400 - 50 - 50
    };
  };

  const depthData = calculateDepthData();

  return (
    <div className="orderbook">
      <div className="pair-selector">
        <img 
          src="https://static.native.org/native-logo-bw.svg" 
          alt="Native" 
          className="native-logo"
        />
      </div>
      <div className="controls">
        <select 
          value={selectedChain}
          onChange={(e) => setSelectedChain(e.target.value as Chain)}
          className="chain-select"
        >
          <option value="ethereum">Ethereum</option>
          <option value="bsc">BSC</option>
          <option value="arbitrum">Arbitrum</option>
          <option value="base">Base</option>
        </select>
        <select 
          value={selectedPair || ''} 
          onChange={(e) => setSelectedPair(e.target.value)}
          className="pair-select"
        >
          {getUniquePairs().map(pair => (
            <option key={pair} value={pair}>
              {pair}
            </option>
          ))}
        </select>
        <button 
          className={`update-toggle ${isAutoUpdate ? 'active' : ''}`}
          onClick={() => setIsAutoUpdate(!isAutoUpdate)}
        >
          {isAutoUpdate ? 'Pause' : 'Resume'} Auto-Update
        </button>
        {!isAutoUpdate && (
          <button 
            className="manual-update"
            onClick={fetchOrderbook}
          >
            Update Now
          </button>
        )}
      </div>
      <div className="orderbook-layout">
        {depthData && (
          <div className="depth-map-container">
            <div className="chart-wrapper" style={{ position: 'relative' }}>
              <svg 
                ref={svgRef}
                className="depth-chart" 
                viewBox="0 0 400 300"
                preserveAspectRatio="none"
                onMouseMove={(e) => {
                  if (!svgRef.current || !depthData) return;
                  const rect = svgRef.current.getBoundingClientRect();
                  const svgX = ((e.clientX - rect.left) / rect.width) * 400;
                  const svgY = ((e.clientY - rect.top) / rect.height) * 300;
                  
                  if (svgX >= depthData.leftPadding && svgX <= 400 - depthData.rightPadding && svgY >= 20 && svgY <= 280) {
                    // Find closest data point
                    type TooltipData = { price: number; cumulative: number; side: 'bid' | 'ask' };
                    let closestData: TooltipData | null = null;
                    let minDist = Infinity;
                    
                    // Check bids
                    for (const d of depthData.bidData) {
                      const x = depthData.leftPadding + ((d.price - depthData.minPrice) / depthData.priceRange) * depthData.chartWidth;
                      const y = 280 - (d.cumulative / depthData.maxCumulative) * 260;
                      const dist = Math.sqrt(Math.pow(svgX - x, 2) + Math.pow(svgY - y, 2));
                      if (dist < minDist && dist < 20) {
                        minDist = dist;
                        closestData = { price: d.price, cumulative: d.cumulative, side: 'bid' };
                      }
                    }
                    
                    // Check asks
                    for (const d of depthData.askData) {
                      const x = depthData.leftPadding + ((d.price - depthData.minPrice) / depthData.priceRange) * depthData.chartWidth;
                      const y = 280 - (d.cumulative / depthData.maxCumulative) * 260;
                      const dist = Math.sqrt(Math.pow(svgX - x, 2) + Math.pow(svgY - y, 2));
                      if (dist < minDist && dist < 20) {
                        minDist = dist;
                        closestData = { price: d.price, cumulative: d.cumulative, side: 'ask' };
                      }
                    }
                    
                    if (closestData) {
                      setTooltip({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                        price: closestData.price,
                        cumulative: closestData.cumulative,
                        side: closestData.side
                      });
                    } else {
                      setTooltip(null);
                    }
                  } else {
                    setTooltip(null);
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
              >
              <defs>
                <linearGradient id="bidGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00cc66" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00cc66" stopOpacity="0.1" />
                </linearGradient>
                <linearGradient id="askGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ff4d4d" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#ff4d4d" stopOpacity="0.1" />
                </linearGradient>
              </defs>
              
              {/* Grid lines */}
              <g className="grid">
                {(() => {
                  const leftPadding = 50;
                  const rightPadding = 50;
                  const chartWidth = 400 - leftPadding - rightPadding;
                  return (
                    <>
                      {[0, 0.25, 0.5, 0.75, 1].map((val) => (
                        <line
                          key={`grid-y-${val}`}
                          x1={leftPadding}
                          y1={20 + val * 260}
                          x2={400 - rightPadding}
                          y2={20 + val * 260}
                          stroke="#e0e0e0"
                          strokeWidth="0.5"
                        />
                      ))}
                      {[0, 0.25, 0.5, 0.75, 1].map((val) => (
                        <line
                          key={`grid-x-${val}`}
                          x1={leftPadding + val * chartWidth}
                          y1="20"
                          x2={leftPadding + val * chartWidth}
                          y2="280"
                          stroke="#e0e0e0"
                          strokeWidth="0.5"
                        />
                      ))}
                    </>
                  );
                })()}
              </g>

              {/* Y-axis labels */}
              <g className="y-axis">
                {(() => {
                  // Calculate nice round numbers for Y-axis
                  const maxVal = depthData.maxCumulative;
                  const roundedMax = Math.ceil(maxVal / 200) * 200; // Round up to nearest 200
                  const numTicks = 5;
                  const step = roundedMax / numTicks;
                  
                  return Array.from({ length: numTicks }, (_, i) => {
                    const val = i / (numTicks - 1);
                    const label = Math.round(roundedMax - (step * i));
                    return (
                    <text
                      key={`y-label-${i}`}
                      x={depthData.leftPadding - 18}
                      y={22 + val * 260}
                      textAnchor="end"
                      fontSize="7"
                      fill="#666"
                    >
                      {label}
                    </text>
                    );
                  });
                })()}
              </g>

              {/* X-axis labels */}
              <g className="x-axis">
                {[0, 0.25, 0.5, 0.75, 1].map((val) => {
                  const price = depthData.minPrice + (depthData.priceRange * val);
                  // Smart formatting: more decimals for smaller numbers
                  let formattedPrice: string;
                  if (price < 1) {
                    formattedPrice = price.toFixed(4);
                  } else if (price < 10) {
                    formattedPrice = price.toFixed(2);
                  } else if (price < 100) {
                    formattedPrice = price.toFixed(1);
                  } else {
                    formattedPrice = Math.round(price).toLocaleString();
                  }
                  return (
                    <text
                      key={`x-label-${val}`}
                      x={depthData.leftPadding + val * depthData.chartWidth}
                      y="290"
                      textAnchor="middle"
                      fontSize="7"
                      fill="#666"
                    >
                      {formattedPrice}
                    </text>
                  );
                })}
              </g>

              {/* Bid area (green) - stepped line */}
              {depthData.bidData.length > 0 && (() => {
                const isSingleLevel = depthData.bidData.length === 1;
                const minWidth = 20; // Minimum width for single level
                const bidPoints: string[] = [];
                const startX = depthData.leftPadding + ((depthData.bidData[0].price - depthData.minPrice) / depthData.priceRange) * depthData.chartWidth;
                bidPoints.push(`${startX},280`);
                
                depthData.bidData.forEach((d, i) => {
                  let x = depthData.leftPadding + ((d.price - depthData.minPrice) / depthData.priceRange) * depthData.chartWidth;
                  const y = 280 - (d.cumulative / depthData.maxCumulative) * 260;
                  
                  if (isSingleLevel) {
                    // For single level, extend horizontally to make it more visible
                    const extendedX = x + minWidth;
                    bidPoints.push(`${x},${y}`);
                    bidPoints.push(`${extendedX},${y}`);
                  } else {
                    if (i === 0) {
                      bidPoints.push(`${x},${y}`);
                    } else {
                      const prevY = 280 - (depthData.bidData[i - 1].cumulative / depthData.maxCumulative) * 260;
                      bidPoints.push(`${x},${prevY}`);
                      bidPoints.push(`${x},${y}`);
                    }
                  }
                });
                
                let lastX = depthData.leftPadding + ((depthData.bidData[depthData.bidData.length - 1].price - depthData.minPrice) / depthData.priceRange) * depthData.chartWidth;
                if (isSingleLevel) {
                  lastX = lastX + minWidth;
                }
                bidPoints.push(`${lastX},280`);
                
                return (
                  <>
                    <path
                      d={`M ${bidPoints.join(' L ')} Z`}
                      fill="url(#bidGradient)"
                    />
                    <polyline
                      points={bidPoints.join(' ')}
                      fill="none"
                      stroke="#00cc66"
                      strokeWidth="1"
                    />
                  </>
                );
              })()}

              {/* Ask area (red) - stepped line */}
              {depthData.askData.length > 0 && (() => {
                const isSingleLevel = depthData.askData.length === 1;
                const minWidth = 20; // Minimum width for single level
                const askPoints: string[] = [];
                const startX = depthData.leftPadding + ((depthData.askData[0].price - depthData.minPrice) / depthData.priceRange) * depthData.chartWidth;
                askPoints.push(`${startX},280`);
                
                depthData.askData.forEach((d, i) => {
                  let x = depthData.leftPadding + ((d.price - depthData.minPrice) / depthData.priceRange) * depthData.chartWidth;
                  const y = 280 - (d.cumulative / depthData.maxCumulative) * 260;
                  
                  if (isSingleLevel) {
                    // For single level, extend horizontally to make it more visible
                    const extendedX = x + minWidth;
                    askPoints.push(`${x},${y}`);
                    askPoints.push(`${extendedX},${y}`);
                  } else {
                    if (i === 0) {
                      askPoints.push(`${x},${y}`);
                    } else {
                      const prevY = 280 - (depthData.askData[i - 1].cumulative / depthData.maxCumulative) * 260;
                      askPoints.push(`${x},${prevY}`);
                      askPoints.push(`${x},${y}`);
                    }
                  }
                });
                
                let lastX = depthData.leftPadding + ((depthData.askData[depthData.askData.length - 1].price - depthData.minPrice) / depthData.priceRange) * depthData.chartWidth;
                if (isSingleLevel) {
                  lastX = lastX + minWidth;
                }
                askPoints.push(`${lastX},280`);
                
                return (
                  <>
                    <path
                      d={`M ${askPoints.join(' L ')} Z`}
                      fill="url(#askGradient)"
                    />
                    <polyline
                      points={askPoints.join(' ')}
                      fill="none"
                      stroke="#ff4d4d"
                      strokeWidth="1"
                    />
                  </>
                );
              })()}

              {/* Axes */}
              <line x1="40" y1="20" x2="40" y2="280" stroke="#333" strokeWidth="1" />
              <line x1="40" y1="280" x2="380" y2="280" stroke="#333" strokeWidth="1" />
            </svg>
            {tooltip && (
              <div 
                className="chart-tooltip"
                style={{
                  position: 'absolute',
                  left: `${tooltip.x}px`,
                  top: `${tooltip.y - 60}px`,
                  pointerEvents: 'none'
                }}
              >
                <div className="tooltip-content">
                  <div><strong>Price:</strong> {formatNumber(tooltip.price)}</div>
                  <div><strong>Cumulative:</strong> {formatNumber(tooltip.cumulative)}</div>
                  <div><strong>Side:</strong> <span className={tooltip.side === 'bid' ? 'bid' : 'ask'}>{tooltip.side === 'bid' ? 'Bid' : 'Ask'}</span></div>
          </div>
              </div>
          )}
        </div>
          </div>
        )}
        <div className="orderbook-container merged">
          <div className="merged-orders">
            <div className="header">
              <span>Price (USDT)</span>
              <span>Amount</span>
              <span>Total</span>
            </div>
            {asks.length > 0 || bids.length > 0 ? (
              <>
                {/* Top part: asks/buying - base=stable, quote=non-stable, sorted descending for display */}
                <div className="asks-section">
                  {asksForDisplay.map(([amount, price], index) => {
                    // For asks: amount from API is in stable token (base), price is already flipped (1/original_price)
                    // To get amount in non-stable token: amount * original_price = amount / flipped_price
                    const originalPrice = 1 / price; // Reverse the flip to get original price
                    const displayAmount = amount * originalPrice; // Convert to non-stable token amount
                    const total = displayAmount * price;
                    return (
                      <div key={`ask-${index}`} className="level ask">
                        <span className="price">{formatNumber(price)}</span>
                        <span className="amount">{formatNumber(displayAmount)}</span>
                        <span className="total">{formatNumber(total)}</span>
                      </div>
                    );
                  })}
                </div>
                
                {/* Mid price and spread display */}
                {midPriceData && (
                  <div className="mid-price-section">
                    <div className="mid-price">
                      <span className="label">MidPrice:</span>
                      <span className="value">{formatNumber(midPriceData.midPrice)}</span>
                      <span className="approx">≈ ${formatNumber(midPriceData.midPrice)}</span>
                    </div>
                    <div className="spread">
                      <span className="label">Spread:</span>
                      <span className="value">{formatNumber(midPriceData.spread)}</span>
                      <span className="percent">({midPriceData.spreadPercent.toFixed(2)}%)</span>
                    </div>
                  </div>
                )}
                
                {/* Bottom part: bids/selling - base=non-stable, quote=stable, price used directly, sorted desc */}
                <div className="bids-section">
                  {bids.map(([amount, price], index) => {
                    const total = amount * price;
                    return (
                      <div key={`bid-${index}`} className="level bid">
                        <span className="price">{formatNumber(price)}</span>
                <span className="amount">{formatNumber(amount)}</span>
                        <span className="total">{formatNumber(total)}</span>
                      </div>
                    );
                  })}
              </div>
              </>
          ) : (
            <div className="no-data">No data available</div>
          )}
          </div>
        </div>
      </div>
      {lastUpdate && (
        <div className="last-update">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default Orderbook; 