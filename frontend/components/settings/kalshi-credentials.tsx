"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

interface KalshiCredentialsProps {
  onSuccess?: () => void;
}

export function KalshiCredentials({ onSuccess }: KalshiCredentialsProps) {
  const [keyId, setKeyId] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [environment, setEnvironment] = useState<"demo" | "production">("demo");
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
    balance?: number;
    tier?: string;
  } | null>(null);

  const handleValidate = async () => {
    if (!keyId || !privateKey) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/auth/validate-credentials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: "frontend-user",
            key_id: keyId,
            private_key_pem: privateKey,
            environment,
          }),
        }
      );

      const result = await response.json();
      setValidationResult({
        valid: result.valid,
        error: result.error,
        balance: result.account_balance,
        tier: result.tier,
      });

      if (result.valid) {
        onSuccess?.();
      }
    } catch (err) {
      setValidationResult({
        valid: false,
        error: err instanceof Error ? err.message : "Failed to validate credentials",
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold mb-2">Kalshi API Credentials</h2>
        <p className="text-sm text-muted-foreground">
          Connect your Kalshi account to enable live trading. Your credentials are encrypted and never stored in plain text.
        </p>
      </div>

      {/* Environment Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setEnvironment("demo")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
            environment === "demo"
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          Demo (Paper Trading)
        </button>
        <button
          onClick={() => setEnvironment("production")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
            environment === "production"
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          }`}
        >
          Production (Real Money)
        </button>
      </div>

      {environment === "production" && (
        <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <p className="text-xs text-amber-400 flex items-center gap-2">
            <i className="icon-[lucide--alert-triangle] h-4 w-4" />
            Production mode uses real money. Double-check all trades before executing.
          </p>
        </div>
      )}

      {/* API Key ID */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">API Key ID</label>
        <Input
          type="text"
          placeholder="Enter your Kalshi API Key ID"
          value={keyId}
          onChange={(e) => setKeyId(e.target.value)}
          className="bg-muted/50 border-border/50 focus:border-primary/50 rounded-xl"
        />
      </div>

      {/* Private Key */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">RSA Private Key (PEM)</label>
        <textarea
          placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
          value={privateKey}
          onChange={(e) => setPrivateKey(e.target.value)}
          rows={6}
          className="w-full bg-muted/50 border border-border/50 focus:border-primary/50 rounded-xl p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="text-xs text-muted-foreground">
          Get your API credentials from{" "}
          <a
            href="https://kalshi.com/account/settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Kalshi API Settings
          </a>
        </p>
      </div>

      {/* Validation Result */}
      {validationResult && (
        <div
          className={`p-4 rounded-xl border ${
            validationResult.valid
              ? "bg-primary/10 border-primary/20"
              : "bg-red-500/10 border-red-500/20"
          }`}
        >
          {validationResult.valid ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[#4AADD8]">
                <i className="icon-[lucide--check-circle] h-5 w-5" />
                <span className="font-medium">Credentials validated successfully</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Balance: ${validationResult.balance?.toFixed(2)}</p>
                <p>Account Tier: {validationResult.tier}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-400">
              <i className="icon-[lucide--x-circle] h-5 w-5" />
              <span>{validationResult.error || "Validation failed"}</span>
            </div>
          )}
        </div>
      )}

      {/* Validate Button */}
      <button
        onClick={handleValidate}
        disabled={!keyId || !privateKey || isValidating}
        className="btn-basilisk w-full h-12 text-base disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isValidating ? (
          <span className="flex items-center justify-center gap-2">
            <i className="icon-[lucide--loader-2] h-5 w-5 animate-spin" />
            Validating...
          </span>
        ) : validationResult?.valid ? (
          <span className="flex items-center justify-center gap-2">
            <i className="icon-[lucide--check] h-5 w-5" />
            Connected
          </span>
        ) : (
          "Validate & Connect"
        )}
      </button>
    </div>
  );
}
