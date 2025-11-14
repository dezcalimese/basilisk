# Kalshi API Setup Guide

This guide walks you through setting up Kalshi API credentials for Basilisk.

## Prerequisites

- A Kalshi account (sign up at [kalshi.com](https://kalshi.com))
- For testing: Use the demo environment (no real money)
- For live trading: Funded Kalshi account

## Step 1: Generate API Keys

1. Log into your Kalshi account
2. Navigate to **Account Settings** → **Profile** at https://kalshi.com/account/profile
3. Scroll to the **API Keys** section
4. Click **"Create New API Key"**

## Step 2: Save Your Credentials

Kalshi will generate two pieces of information:

### Key ID
A unique identifier that looks like: `abc123def456ghi789`

### Private Key (RSA Format)
A PEM-formatted private key that looks like:

```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
...
-----END RSA PRIVATE KEY-----
```

⚠️ **CRITICAL**: The private key is shown **only once**. You cannot retrieve it again after closing the page!

### Save the Private Key

1. Copy the entire private key (including the BEGIN/END lines)
2. Save it to a file, for example: `kalshi_private_key.pem`
3. Store this file **securely** and **outside** of your git repository

Example location:
```bash
# Create a secure directory
mkdir -p ~/.kalshi
chmod 700 ~/.kalshi

# Save the key (paste your key when prompted)
nano ~/.kalshi/private_key.pem
chmod 600 ~/.kalshi/private_key.pem
```

## Step 3: Configure Basilisk

1. Navigate to your backend directory:
```bash
cd backend
```

2. Copy the example environment file:
```bash
cp .env.example .env
```

3. Edit `.env` and add your credentials:
```bash
nano .env
```

4. Update these values:
```env
# For testing with demo environment (recommended)
KALSHI_KEY_ID=your_key_id_here
KALSHI_PRIVATE_KEY_PATH=/Users/yourname/.kalshi/private_key.pem
KALSHI_USE_DEMO=true

# For live trading (real money - be careful!)
KALSHI_USE_DEMO=false
```

## Step 4: Verify Setup

Test your configuration:

```bash
cd backend
uv run python -c "
from app.data.kalshi_client import KalshiClient
import asyncio

async def test():
    client = KalshiClient()
    try:
        markets = await client.get_markets()
        print('✅ Successfully connected to Kalshi API!')
        print(f'Found {len(markets.get(\"markets\", []))} markets')
    except Exception as e:
        print(f'❌ Error: {e}')

asyncio.run(test())
"
```

## Demo vs Production Environments

### Demo Environment (Default)
- **URL**: `https://demo-api.kalshi.co/trade-api/v2`
- **Purpose**: Safe testing with fake money
- **Use when**: Developing and testing Basilisk
- **Setting**: `KALSHI_USE_DEMO=true`

### Production Environment
- **URL**: `https://api.elections.kalshi.com/trade-api/v2`
- **Purpose**: Real trading with real money
- **Use when**: You're ready to trade for real
- **Setting**: `KALSHI_USE_DEMO=false`
- ⚠️ **WARNING**: Uses real money! Test thoroughly in demo first.

## Authentication Details

Basilisk uses Kalshi's RSA-PSS signature authentication:

1. Each API request is signed with your private key
2. The signature includes:
   - Current timestamp (milliseconds)
   - HTTP method (GET, POST, etc.)
   - Request path (without query parameters)
3. Three headers are sent with each request:
   - `KALSHI-ACCESS-KEY`: Your Key ID
   - `KALSHI-ACCESS-SIGNATURE`: RSA-PSS signature
   - `KALSHI-ACCESS-TIMESTAMP`: Request timestamp

This is all handled automatically by the `KalshiClient` class!

## Security Best Practices

### ✅ DO:
- Store private keys outside your git repository
- Use restrictive file permissions (600 or 400)
- Start with the demo environment
- Keep your Key ID and private key separate from code
- Rotate keys periodically

### ❌ DON'T:
- Commit private keys to git
- Share your private key with anyone
- Use production credentials for testing
- Store keys in publicly accessible locations
- Hardcode credentials in source code

## Troubleshooting

### "FileNotFoundError: Private key file not found"
- Check that `KALSHI_PRIVATE_KEY_PATH` points to the correct file
- Verify the file exists: `ls -la /path/to/your/key.pem`
- Check file permissions: `chmod 600 /path/to/your/key.pem`

### "API Error: 401 Unauthorized"
- Verify your Key ID is correct
- Ensure the private key matches the Key ID
- Check if you're using the right environment (demo vs prod)
- Confirm the private key file is readable

### "API Error: 403 Forbidden"
- Your account may not have API access enabled
- Check if your account is verified
- Ensure you're using a recent API key

## Additional Resources

- [Kalshi API Documentation](https://docs.kalshi.com)
- [Kalshi API Keys Guide](https://docs.kalshi.com/getting_started/api_keys)
- [Kalshi Developer Agreement](https://kalshi.com/developer-agreement)

## Need Help?

- Check the [Basilisk README](README.md) for general setup
- Review backend logs for detailed error messages
- Consult Kalshi's documentation for API-specific issues
