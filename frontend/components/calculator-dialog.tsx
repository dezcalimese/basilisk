"use client";

import { useState, useEffect } from "react";
import { X, Calculator } from "lucide-react";
import { LimitOrderCalculator } from "@/components/dashboard/limit-order-calculator";

export function CalculatorDialog() {
  const [isOpen, setIsOpen] = useState(false);

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "c" || e.key === "C") {
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 bg-primary text-primary-foreground rounded-full p-4 shadow-lg hover:bg-primary/90 transition-colors z-50"
        title="Calculator (Press C)"
      >
        <Calculator className="h-6 w-6" />
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => setIsOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="glass-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b p-6">
            <h2 className="text-2xl font-bold">Limit Order Calculator</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <LimitOrderCalculator />
          </div>

          {/* Footer */}
          <div className="border-t p-4 bg-muted/30">
            <p className="text-center text-sm text-muted-foreground">
              Press <kbd className="px-2 py-1 bg-background rounded text-xs">ESC</kbd> or click outside to close
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
