# Vercel Proxy Setup Guide

This project uses a Vercel serverless function to proxy API requests, which:
1. **Hides the API key** from the client-side code
2. **Adds a 2-second delay** to avoid exposing real-time orderbook levels

## Setup Instructions

### 1. Deploy to Vercel

1. Push your code to GitHub/GitLab/Bitbucket
2. Import the project in [Vercel Dashboard](https://vercel.com/dashboard)
3. Vercel will automatically detect the project and configure it

### 2. Set Environment Variable

1. Go to your project in Vercel Dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new environment variable:
   - **Name**: `NATIVE_API_KEY`
   - **Value**: Your Native API key
   - **Environment**: Production, Preview, Development (select all)
4. Click **Save**

### 3. Redeploy

After setting the environment variable, trigger a new deployment:
- Go to **Deployments** tab
- Click **Redeploy** on the latest deployment
- Or push a new commit to trigger automatic deployment

## How It Works

### Development Mode
- Uses direct API calls with `VITE_API_KEY` from `.env` file
- No delay (for faster development)

### Production Mode (Vercel)
- Uses `/api/orderbook` proxy endpoint
- API key is stored server-side in `NATIVE_API_KEY` environment variable
- Automatically adds 2-second delay before returning results
- API key is never exposed to the client

## API Route

The proxy endpoint is located at `api/orderbook.ts`:
- Accepts `chain` query parameter
- Adds 2-second delay
- Fetches from Native API using server-side API key
- Returns orderbook data with CORS headers

## Testing Locally

For local testing with the proxy:
1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel dev`
3. The API route will be available at `http://localhost:3000/api/orderbook`

