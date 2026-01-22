"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedPriceProps {
  price: number;
  decimals?: number;
  className?: string;
}

export function AnimatedPrice({ price, decimals = 2, className }: AnimatedPriceProps) {
  const [displayPrice, setDisplayPrice] = useState(price);
  const [isAnimating, setIsAnimating] = useState(false);
  const [priceDirection, setPriceDirection] = useState<"up" | "down" | null>(
    null
  );
  const previousPriceRef = useRef(price);

  useEffect(() => {
    const previousPrice = previousPriceRef.current;
    if (price === previousPrice) {
      return;
    }

    setIsAnimating(true);
    setPriceDirection(price > previousPrice ? "up" : "down");

    const duration = 1000;
    const steps = 20;
    const stepDuration = duration / steps;
    const priceDiff = price - previousPrice;
    const priceStep = priceDiff / steps;

    let currentStep = 0;
    let currentPrice = previousPrice;

    const interval = setInterval(() => {
      currentStep++;
      currentPrice += priceStep;

      if (currentStep >= steps) {
        setDisplayPrice(price);
        clearInterval(interval);
        previousPriceRef.current = price;
        setTimeout(() => {
          setIsAnimating(false);
          setPriceDirection(null);
        }, 500);
      } else {
        setDisplayPrice(currentPrice);
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [price]);

  return (
    <div className="relative flex items-center gap-1">
      <span
        className={`font-bold transition-all duration-300 ${className || "text-2xl"} ${
          isAnimating
            ? priceDirection === "up"
              ? "text-primary"
              : "text-red-500"
            : ""
        }`}
      >
        ${displayPrice.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
      </span>
      {isAnimating && (
        <span
          className={`text-sm animate-bounce ${
            priceDirection === "up" ? "text-primary" : "text-red-500"
          }`}
        >
          {priceDirection === "up" ? "↑" : "↓"}
        </span>
      )}
    </div>
  );
}
