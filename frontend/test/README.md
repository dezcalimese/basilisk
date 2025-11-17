# Basilisk Frontend Test Suite

Comprehensive test suite for the Basilisk trading analytics platform.

## Test Stack

- **Framework**: Vitest (faster alternative to Jest, better ESM support)
- **React Testing**: React Testing Library (@testing-library/react)
- **DOM Environment**: jsdom
- **Coverage**: V8

## Running Tests

```bash
# Run tests in watch mode (interactive)
npm test

# Run tests once (CI mode)
npm run test:run

# Run tests with UI (interactive dashboard)
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## Test Structure

```
frontend/
├── test/
│   ├── setup.ts              # Global test setup
│   └── README.md             # This file
├── components/
│   └── **/__tests__/         # Component tests
├── lib/
│   ├── indicators/__tests__/ # Indicator logic tests
│   ├── stores/__tests__/     # Zustand store tests
│   └── __tests__/            # Utility tests
└── vitest.config.ts          # Vitest configuration
```

## Test Coverage

### Unit Tests

#### Indicators (`lib/indicators/__tests__/`)
- **RSI Tests**: 9 tests covering calculation, formatting, and edge cases
  - Basic RSI calculation with 14-period
  - Custom period configuration
  - Value bounds (0-100)
  - Insufficient data handling
  - Empty array handling
  - Chart data formatting
  - Timestamp conversion

#### Stores (`lib/stores/__tests__/`)
- **Realtime Store Tests**: 10 tests covering state management
  - Price updates
  - Candle data management
  - Connection state tracking
  - State reset functionality

#### API Clients (`lib/__tests__/`)
- **Exchange API Tests**: 7 tests covering HTTP interactions
  - Successful candle fetching
  - HTTP error handling
  - Network error handling
  - Empty data handling
  - Data transformation
  - URL construction

#### Components (`components/dashboard/__tests__/`)
- **MetricCard Tests**: 7 tests covering rendering and styling
  - Title, value, description rendering
  - String and numeric values
  - Zero value handling
  - Styling verification
  - Different value types

### Integration Tests

Integration tests verify end-to-end workflows:
- SSE stream connections
- Real-time data flow
- Chart rendering with live data

## Writing Tests

### Example: Component Test

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../my-component';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent title="Test" value={100} />);

    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});
```

### Example: Store Test

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useMyStore } from '../my-store';

describe('MyStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useMyStore.setState({ count: 0 });
  });

  it('should increment count', () => {
    const { increment } = useMyStore.getState();
    increment();
    expect(useMyStore.getState().count).toBe(1);
  });
});
```

### Example: API Test

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('API Client', () => {
  it('should handle successful response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: 'test' }),
    });

    const response = await fetch('/api/test');
    const data = await response.json();

    expect(data).toEqual({ data: 'test' });
  });
});
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Reset State**: Always reset shared state in `beforeEach`
3. **Mock External Dependencies**: Use `vi.fn()` for mocks
4. **Test Behavior, Not Implementation**: Focus on what the user sees
5. **Descriptive Names**: Use clear, specific test names
6. **Arrange-Act-Assert**: Follow AAA pattern

## Coverage Goals

- **Indicators**: 100% (pure functions, easy to test)
- **Stores**: 95%+ (critical business logic)
- **Components**: 80%+ (focus on user-facing behavior)
- **API Clients**: 90%+ (critical infrastructure)

## CI/CD Integration

Tests run automatically on:
- Pull request creation
- Push to main branch
- Pre-commit hook (optional)

Minimum requirements for merge:
- All tests passing
- Coverage >= 80%

## Troubleshooting

### "Cannot find module" errors
```bash
# Ensure path aliases are configured in vitest.config.ts
npm run test:run -- --reporter=verbose
```

### Tests timing out
```bash
# Increase timeout in vitest.config.ts
test: {
  testTimeout: 10000
}
```

### Coverage not generating
```bash
# Install coverage provider
npm install --save-dev @vitest/coverage-v8
```

## Future Improvements

- [ ] Add E2E tests with Playwright
- [ ] Add visual regression testing
- [ ] Add performance benchmarks
- [ ] Add mutation testing
- [ ] Increase coverage to 90%+
