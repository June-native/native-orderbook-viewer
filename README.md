# Native Orderbook Utility

A React-based orderbook visualization tool for displaying cryptocurrency trading pairs across multiple blockchain networks. Built with React, TypeScript, and Vite.

## Features

- 📊 **Real-time Orderbook Display** - View live orderbook data with asks and bids
- 📈 **Depth Chart Visualization** - Interactive depth chart showing cumulative orderbook levels
- 🔗 **Multi-Chain Support** - Supports Ethereum, BSC, Arbitrum, and Base networks
- 🔒 **Secure API Proxy** - Vercel serverless function to hide API keys and add delays
- 🎨 **Modern UI** - Clean, responsive interface with merged orderbook view
- 📱 **Responsive Design** - Works on desktop and mobile devices

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Vercel** - Deployment and serverless functions

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Native API key (get one from [Native.org](https://native.org))

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd native-orderbook-util
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```bash
VITE_API_KEY=your_api_key_here
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:5173](http://localhost:5173) in your browser

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

### Project Structure

```
├── api/
│   └── orderbook.ts          # Vercel serverless function (proxy)
├── src/
│   ├── components/
│   │   ├── Orderbook.tsx    # Main orderbook component
│   │   └── Orderbook.css    # Orderbook styles
│   ├── App.tsx
│   └── main.tsx
├── vercel.json               # Vercel configuration
└── vite.config.ts            # Vite configuration
```

## Deployment

### Vercel Deployment

This project is configured to deploy on Vercel with a serverless API proxy. See [VERCEL_SETUP.md](./VERCEL_SETUP.md) for detailed setup instructions.

**Quick Setup:**
1. Push your code to GitHub/GitLab/Bitbucket
2. Import project in [Vercel Dashboard](https://vercel.com/dashboard)
3. Set environment variable `NATIVE_API_KEY` in Vercel dashboard
4. Deploy!

The Vercel proxy provides:
- ✅ API key security (hidden from client-side)
- ✅ 2-second delay to prevent real-time data exposure
- ✅ CORS handling

### Environment Variables

**For Local Development:**
- `VITE_API_KEY` - Your Native API key (stored in `.env`)

**For Vercel Production:**
- `NATIVE_API_KEY` - Your Native API key (set in Vercel dashboard)

## Usage

1. **Select Chain** - Choose from Ethereum, BSC, Arbitrum, or Base
2. **Select Trading Pair** - Pick a trading pair from the dropdown
3. **View Orderbook** - See asks (red) and bids (green) with prices, amounts, and totals
4. **Explore Depth Chart** - Hover over the chart to see cumulative amounts and prices
5. **Monitor Mid Price & Spread** - View real-time mid price and spread information

## Features Explained

### Merged Orderbook View
- Displays asks and bids in a single merged list
- Asks sorted descending (highest price first)
- Bids sorted descending (highest price first)
- Mid price and spread displayed in the middle

### Depth Chart
- Visual representation of orderbook depth
- Green area for bids (buy orders)
- Red area for asks (sell orders)
- Interactive tooltips on hover
- Cumulative amount visualization

### Auto-Update
- Automatically refreshes every 2 seconds
- Can be paused/resumed manually
- Manual update button available when paused

## API Proxy

The project uses a Vercel serverless function (`api/orderbook.ts`) that:
- Proxies requests to the Native API
- Hides the API key from client-side code
- Adds a 2-second delay to prevent real-time data exposure
- Handles CORS automatically

In development, the app uses direct API calls. In production (Vercel), it uses the proxy endpoint.

## License

This project is private and proprietary.

## Support

For issues or questions, please contact the development team.
