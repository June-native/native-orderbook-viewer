import { useEffect, useState } from 'react';
import './Orderbook.css';

interface OrderbookEntry {
  base_symbol: string;
  quote_symbol: string;
  base_address: string;
  quote_address: string;
  side: 'bid' | 'ask';
  levels: [number, number][];
}

type Chain = 'ethereum' | 'bsc';

const Orderbook = () => {
  const [orderbookData, setOrderbookData] = useState<OrderbookEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<Chain>('bsc');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isAutoUpdate, setIsAutoUpdate] = useState(true);

  const fetchOrderbook = async () => {
    try {
      const response = await fetch(`https://v2.api.native.org/swap-api-v2/v1/orderbook?chain=${selectedChain}`, {
        headers: {
          'apiKey': '5e31284c49d4bd203e17391d612cae6fca071eab'
        }
      });
      
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
        const response = await fetch(`https://v2.api.native.org/swap-api-v2/v1/orderbook?chain=${selectedChain}`, {
          headers: {
            'apiKey': '5e31284c49d4bd203e17391d612cae6fca071eab'
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch orderbook data');
        }

        const data = await response.json();
        setOrderbookData(data);
        
        // Always set to first pair when chain changes
        if (data.length > 0) {
          const firstEntry = data[0];
          setSelectedPair(`${firstEntry.base_symbol}/${firstEntry.quote_symbol}`);
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

  const getSelectedPairData = () => {
    if (!selectedPair) return null;
    const [base, quote] = selectedPair.split('/');
    
    // Find the bid side (original direction)
    const bidEntry = orderbookData.find(entry => 
      entry.base_symbol === base && 
      entry.quote_symbol === quote && 
      entry.side === 'bid'
    );

    // Find the ask side (flipped direction)
    const askEntry = orderbookData.find(entry => 
      entry.base_symbol === quote && 
      entry.quote_symbol === base && 
      entry.side === 'bid'
    );

    return { bidEntry, askEntry };
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

  if (loading) {
    return <div className="loading">Loading orderbook...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const selectedData = getSelectedPairData();
  const bids = selectedData?.bidEntry?.levels || [];
  const asks = selectedData?.askEntry?.levels || [];

  return (
    <div className="orderbook">
      <div className="pair-selector">
        <h2>Orderbook - {selectedChain.toUpperCase()} - {selectedPair || 'Select Pair'}</h2>
      </div>
      <div className="controls">
        <select 
          value={selectedChain}
          onChange={(e) => setSelectedChain(e.target.value as Chain)}
          className="chain-select"
        >
          <option value="ethereum">Ethereum</option>
          <option value="bsc">BSC</option>
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
      <div className="orderbook-container">
        <div className="asks">
          <h3>{selectedPair?.split('/')[1] || ''} -&gt; {selectedPair?.split('/')[0] || ''}</h3>
          <span className="bid-ask-label">Bids</span>
          <div className="header">
            <span>Amount</span>
            <span>Price</span>
          </div>
          {asks.length > 0 ? (
            asks.map(([amount, price], index) => (
              <div key={index} className="level ask">
                <span className="amount">{formatNumber(amount * price)}</span>
                <span className="price">{formatNumber(1 / price)}</span>
              </div>
            ))
          ) : (
            <div className="no-data">No data available</div>
          )}
        </div>
        <div className="bids">
          <h3>{selectedPair?.split('/')[0] || ''} -&gt; {selectedPair?.split('/')[1] || ''}</h3>
          <span className="bid-ask-label">Asks</span>
          <div className="header">
            <span>Amount</span>
            <span>Price</span>
          </div>
          {bids.length > 0 ? (
            bids.map(([amount, price], index) => (
              <div key={index} className="level bid">
                <span className="amount">{formatNumber(amount)}</span>
                <span className="price">{formatNumber(price)}</span>
              </div>
            ))
          ) : (
            <div className="no-data">No data available</div>
          )}
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