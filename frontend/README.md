# Basilisk Frontend

Next.js dashboard for the Basilisk trading analytics system.

## Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Main dashboard page
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   └── dashboard/        # Dashboard-specific components
│       ├── metric-card.tsx
│       └── signal-list.tsx
├── lib/                   # Utilities
│   ├── api.ts            # Backend API client
│   └── utils.ts          # Helper functions
└── package.json
```

## Setup

### Install Dependencies

```bash
bun install
```

### Configuration

Create `.env.local`:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Run Development Server

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

### Dashboard Components

#### Metric Cards
Display key statistics:
- Active signals count
- Average expected value
- Highest EV opportunity

#### Signal List
Shows active trade signals with:
- Ticker and contract info
- Signal type (YES/NO)
- Recommended price
- Expected value
- Edge percentage
- Confidence score
- Time to expiry

### API Integration

The `api.ts` client handles communication with the backend:

```typescript
import { api } from "@/lib/api";

// Get current signals
const signals = await api.getCurrentSignals(10);

// Health check
const health = await api.healthCheck();
```

### Auto-refresh

The dashboard automatically refreshes every 5 minutes to fetch the latest signals.

## Development

### Build for Production

```bash
bun run build
```

### Run Production Build

```bash
bun start
```

### Linting

```bash
bun run lint
```

## UI Components

Uses [shadcn/ui](https://ui.shadcn.com/) components:
- `Card` - Container components
- `Badge` - Status indicators
- `Button` - Interactive elements

### Adding Components

```bash
bunx shadcn@latest add [component-name]
```

## Styling

Built with Tailwind CSS v4:
- Utility-first CSS
- Dark mode support (coming soon)
- Responsive design
- Custom design tokens in `app/globals.css`

## TypeScript

Strict TypeScript configuration for type safety:
- Full type coverage
- API response types
- Component prop types

## Performance

- Bun for fast package installation and bundling
- Next.js App Router for optimal performance
- Automatic code splitting
- Optimized images with Next.js Image component

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES2020+ features

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:8000` |

## Next Steps

1. Add historical charts with Recharts
2. Implement dark mode toggle
3. Add signal detail pages
4. Add browser notifications
5. Implement signal filtering/sorting
6. Add performance metrics visualization
7. Create responsive mobile layout
