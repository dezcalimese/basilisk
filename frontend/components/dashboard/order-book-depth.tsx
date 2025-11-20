"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

interface OrderBookData {
  yes_bids: OrderBookLevel[];
  yes_asks: OrderBookLevel[];
  no_bids: OrderBookLevel[];
  no_asks: OrderBookLevel[];
  spread: number;
  mid_price: number;
}

interface OrderBookDepthProps {
  ticker?: string;
  apiUrl?: string;
}

export function OrderBookDepth({
  ticker,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
}: OrderBookDepthProps) {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) {
      setLoading(false);
      setOrderBook(null);
      return;
    }

    // Reset state when ticker changes
    setLoading(true);
    setOrderBook(null);
    setError(null);

    const fetchOrderBook = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/v1/orderbook/${ticker}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        setOrderBook(data);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch order book:", err);
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };

    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [ticker, apiUrl]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
        <h2 className="text-lg font-bold mb-3">Order Book Depth</h2>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !orderBook) {
    return (
      <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
        <h2 className="text-lg font-bold mb-3">Order Book Depth</h2>
        <p className="text-sm text-muted-foreground">
          Select a contract to view order book
        </p>
      </div>
    );
  }

  const maxTotal = Math.max(
    ...orderBook.yes_bids.map((l) => l.total),
    ...orderBook.yes_asks.map((l) => l.total),
    ...orderBook.no_bids.map((l) => l.total),
    ...orderBook.no_asks.map((l) => l.total)
  );

  return (
    <div className="glass-card rounded-2xl p-6 h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-bold">Order Book</h2>
        <p className="text-xs text-muted-foreground font-mono">
          Spread: {(orderBook.spread * 100).toFixed(1)}¢ | Mid: {(orderBook.mid_price * 100).toFixed(1)}¢
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        {/* YES Market */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <h3 className="text-sm font-semibold text-green-600">YES</h3>
          </div>

          {/* YES Asks (Sellers) */}
          <div className="space-y-1 mb-2">
            {orderBook.yes_asks.slice(0, 5).reverse().map((level, idx) => (
              <OrderBookRow
                key={`yes-ask-${idx}`}
                price={level.price}
                quantity={level.quantity}
                total={level.total}
                maxTotal={maxTotal}
                type="ask"
              />
            ))}
          </div>

          {/* Spread */}
          <div className="border-t border-b border-border/50 py-1 my-2">
            <p className="text-center text-xs text-muted-foreground">
              {(orderBook.mid_price * 100).toFixed(1)}¢
            </p>
          </div>

          {/* YES Bids (Buyers) */}
          <div className="space-y-1">
            {orderBook.yes_bids.slice(0, 5).map((level, idx) => (
              <OrderBookRow
                key={`yes-bid-${idx}`}
                price={level.price}
                quantity={level.quantity}
                total={level.total}
                maxTotal={maxTotal}
                type="bid"
              />
            ))}
          </div>
        </div>

        {/* NO Market */}
        <div className="pt-4 border-t border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-600">NO</h3>
          </div>

          {/* NO Asks (Sellers) */}
          <div className="space-y-1 mb-2">
            {orderBook.no_asks.slice(0, 3).reverse().map((level, idx) => (
              <OrderBookRow
                key={`no-ask-${idx}`}
                price={level.price}
                quantity={level.quantity}
                total={level.total}
                maxTotal={maxTotal}
                type="ask"
              />
            ))}
          </div>

          {/* NO Bids (Buyers) */}
          <div className="space-y-1">
            {orderBook.no_bids.slice(0, 3).map((level, idx) => (
              <OrderBookRow
                key={`no-bid-${idx}`}
                price={level.price}
                quantity={level.quantity}
                total={level.total}
                maxTotal={maxTotal}
                type="bid"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderBookRow({
  price,
  quantity,
  total,
  maxTotal,
  type,
}: {
  price: number;
  quantity: number;
  total: number;
  maxTotal: number;
  type: "bid" | "ask";
}) {
  const percentage = (total / maxTotal) * 100;
  const bgColor = type === "bid"
    ? "bg-green-500/10"
    : "bg-red-500/10";
  const textColor = type === "bid"
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";

  return (
    <div className="relative h-6">
      {/* Depth bar */}
      <div
        className={`absolute inset-y-0 right-0 ${bgColor}`}
        style={{ width: `${percentage}%` }}
      />

      {/* Content */}
      <div className="relative px-2 flex justify-between items-center h-full text-xs font-mono">
        <span className={textColor}>{(price * 100).toFixed(1)}¢</span>
        <span className="text-muted-foreground">{quantity}</span>
        <span className="text-muted-foreground font-semibold">{total}</span>
      </div>
    </div>
  );
}
