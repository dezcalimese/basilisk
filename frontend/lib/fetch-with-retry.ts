/**
 * Robust fetch utility with automatic retries and exponential backoff
 *
 * Designed for 99%+ uptime on dashboard data fetches
 */

interface RetryOptions {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelay?: number;
  /** Maximum delay between retries (default: 30000) */
  maxDelay?: number;
  /** Timeout for each request in ms (default: 10000) */
  timeout?: number;
  /** Called on each retry attempt */
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  timeout: 10000,
};

/**
 * Fetch with automatic retry and exponential backoff
 *
 * @example
 * const data = await fetchWithRetry('/api/v1/statistics/hourly-movements', {
 *   maxRetries: 3,
 *   onRetry: (attempt, error) => console.log(`Retry ${attempt}:`, error.message)
 * });
 */
export async function fetchWithRetry<T>(
  url: string,
  options: RetryOptions & RequestInit = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_OPTIONS.maxRetries,
    initialDelay = DEFAULT_OPTIONS.initialDelay,
    maxDelay = DEFAULT_OPTIONS.maxDelay,
    timeout = DEFAULT_OPTIONS.timeout,
    onRetry,
    ...fetchOptions
  } = options;

  let lastError: Error = new Error('Unknown error');
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on abort (user cancelled)
      if (lastError.name === 'AbortError' && attempt === 0) {
        throw new Error('Request timed out');
      }

      attempt++;

      if (attempt > maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        initialDelay * Math.pow(2, attempt - 1) + Math.random() * 500,
        maxDelay
      );

      onRetry?.(attempt, lastError, delay);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Create a polling fetcher that automatically retries and continues polling
 *
 * @example
 * const poller = createPollingFetcher('/api/v1/data', {
 *   interval: 60000,
 *   onData: (data) => setData(data),
 *   onError: (err) => console.error(err)
 * });
 *
 * poller.start();
 * // later...
 * poller.stop();
 */
export function createPollingFetcher<T>(
  url: string,
  options: {
    interval: number;
    onData: (data: T) => void;
    onError?: (error: Error) => void;
    onRetry?: RetryOptions['onRetry'];
    retryOptions?: RetryOptions;
  }
) {
  let timeoutId: NodeJS.Timeout | null = null;
  let isRunning = false;

  const poll = async () => {
    if (!isRunning) return;

    try {
      const data = await fetchWithRetry<T>(url, {
        ...options.retryOptions,
        onRetry: options.onRetry,
      });
      options.onData(data);
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }

    if (isRunning) {
      timeoutId = setTimeout(poll, options.interval);
    }
  };

  return {
    start: () => {
      if (isRunning) return;
      isRunning = true;
      poll(); // Start immediately
    },
    stop: () => {
      isRunning = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
    isRunning: () => isRunning,
  };
}
