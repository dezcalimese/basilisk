"use client";

import { useState, useEffect } from "react";
import { X, Calculator } from "lucide-react";
import { LimitOrderCalculator } from "@/components/dashboard/limit-order-calculator";

export function CalculatorDialog() {
  const [isOpen, setIsOpen] = useState(false);

  // Keyboard shortcut (ignore if modifier keys are pressed)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger on Cmd+C, Ctrl+C, etc.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

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
        className="fixed bottom-16 right-4 bg-primary text-primary-foreground rounded-full p-2.5 shadow-md hover:shadow-lg transition-all duration-200 ease-out z-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        title="Calculator (Press C)"
        aria-label="Open calculator"
      >
        <Calculator className="h-5 w-5" aria-hidden="true" />
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
        <div
          className="glass-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calculator-dialog-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b p-6">
            <h2 className="text-2xl font-bold" id="calculator-dialog-title">Limit Order Calculator</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground transition-colors duration-200 ease-out rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close calculator"
            >
              <X className="h-6 w-6" aria-hidden="true" />
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
