"use client";

import { useState, useEffect } from "react";
import { X, HelpCircle } from "lucide-react";

export function HelpDialog() {
  const [isOpen, setIsOpen] = useState(false);

  // Keyboard shortcut (ignore if modifier keys are pressed)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger on Cmd+H, Ctrl+H, etc.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "h" || e.key === "H" || e.key === "?") {
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
        className="fixed bottom-6 right-6 bg-primary text-primary-foreground rounded-full p-4 shadow-lg hover:bg-primary/90 transition-colors z-50"
        title="Help (Press H or ?)"
      >
        <HelpCircle className="h-6 w-6" />
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
            <h2 className="text-2xl font-bold">Help & Metrics Guide</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Column Explanations */}
            <section>
              <h3 className="text-xl font-semibold mb-4">Table Columns</h3>
              <div className="space-y-4">
                <div className="glass-metric rounded-xl p-4">
                  <h4 className="font-semibold text-lg mb-2">Imp% (Implied Probability)</h4>
                  <p className="text-muted-foreground mb-2">
                    Market's implied probability of the contract winning
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-green-500">↑ Higher</span>
                    <span className="text-muted-foreground">Market thinks it's more likely to happen</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-500">↓ Lower</span>
                    <span className="text-muted-foreground">Market thinks it's less likely to happen</span>
                  </div>
                </div>

                <div className="glass-metric rounded-xl p-4">
                  <h4 className="font-semibold text-lg mb-2">Mod% (Model Probability)</h4>
                  <p className="text-muted-foreground mb-2">
                    Our model's calculated probability of the contract winning
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-green-500">↑ Higher</span>
                    <span className="text-muted-foreground">Our model thinks it's more likely</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-500">↓ Lower</span>
                    <span className="text-muted-foreground">Our model thinks it's less likely</span>
                  </div>
                </div>

                <div className="glass-metric rounded-xl p-4">
                  <h4 className="font-semibold text-lg mb-2">EV (Expected Value)</h4>
                  <p className="text-muted-foreground mb-2">
                    The edge we have over the market
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-green-500">↑ Higher Positive EV</span>
                    <span className="text-muted-foreground">Better trading opportunity</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-red-500">↓ Lower or Negative EV</span>
                    <span className="text-muted-foreground">Worse trading opportunity</span>
                  </div>
                  <p className="mt-2 text-sm bg-muted p-2 rounded">
                    <strong>Key:</strong> When Mod% &gt; Imp%, you have positive EV because the market is underpricing the probability
                  </p>
                </div>

                <div className="glass-metric rounded-xl p-4">
                  <h4 className="font-semibold text-lg mb-2">Action</h4>
                  <p className="text-muted-foreground mb-2">
                    Trading recommendation based on EV
                  </p>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-green-500/10 text-green-500 px-2 py-1 rounded">BUY YES</span>
                      <span className="text-muted-foreground">Market underpriced YES - buy the YES side</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-red-500/10 text-red-500 px-2 py-1 rounded">BUY NO</span>
                      <span className="text-muted-foreground">Market overpriced YES - buy the NO side</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-muted px-2 py-1 rounded">HOLD</span>
                      <span className="text-muted-foreground">No edge or insufficient edge to trade</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Keyboard Shortcuts */}
            <section>
              <h3 className="text-xl font-semibold mb-4">Keyboard Shortcuts</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <kbd className="px-3 py-1.5 bg-muted rounded text-sm font-mono">H</kbd>
                  <span className="text-sm text-muted-foreground">Toggle help</span>
                </div>
                <div className="flex items-center gap-3">
                  <kbd className="px-3 py-1.5 bg-muted rounded text-sm font-mono">?</kbd>
                  <span className="text-sm text-muted-foreground">Toggle help</span>
                </div>
                <div className="flex items-center gap-3">
                  <kbd className="px-3 py-1.5 bg-muted rounded text-sm font-mono">C</kbd>
                  <span className="text-sm text-muted-foreground">Toggle calculator</span>
                </div>
                <div className="flex items-center gap-3">
                  <kbd className="px-3 py-1.5 bg-muted rounded text-sm font-mono">ESC</kbd>
                  <span className="text-sm text-muted-foreground">Close dialogs</span>
                </div>
              </div>
            </section>

            {/* Additional Info */}
            <section>
              <h3 className="text-xl font-semibold mb-4">How It Works</h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Basilisk analyzes Bitcoin hourly contracts on Kalshi to find mispriced opportunities. Our statistical model calculates the true probability of each outcome and compares it to the market's implied probability.
                </p>
                <p>
                  When the market underprices a contract (Mod% &gt; Imp%), we have positive expected value (EV). Higher EV means a better trading opportunity.
                </p>
                <p className="bg-muted p-3 rounded">
                  <strong>Example:</strong> If the market prices a contract at 50% (Imp%) but our model calculates 47.5% (Mod%), we have +39.3% EV - the market is overpricing this contract.
                </p>
              </div>
            </section>

            {/* Settlement Rule */}
            <section>
              <h3 className="text-xl font-semibold mb-4">Settlement Rule</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <ul className="list-disc list-inside space-y-1">
                  <li>Settlement begins 1 minute before expiration</li>
                  <li>Final price = Average BTC price during the last 60 seconds</li>
                  <li>Contract resolves YES if final price is above strike, NO if below</li>
                </ul>
              </div>
            </section>
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
