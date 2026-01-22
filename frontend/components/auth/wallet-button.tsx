"use client";

import { useEffect, useState, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { usePrivyConfig } from "@/providers/privy-provider";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";
import type { SolanaWallet } from "@/lib/stores/auth-store";

// USDC mint address on Solana mainnet
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Disabled button shown when Privy is not configured
function DisabledWalletButton() {
  return (
    <button
      disabled
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted/50 text-muted-foreground font-semibold text-sm cursor-not-allowed"
      title="Wallet connection not configured"
    >
      <i className="icon-[lucide--wallet] w-4 h-4" />
      Connect Wallet
    </button>
  );
}

// Active wallet button that uses Privy hooks
function ActiveWalletButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    setUser,
    setWallet,
    setBalance,
    setLoading,
    setBalanceLoading,
    wallet,
    balance,
    balanceLoading,
    logout: storeLogout,
  } = useAuthStore();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync Privy state to our store
  useEffect(() => {
    if (!ready) return;

    setLoading(false);

    if (authenticated && user) {
      const solanaWallet = wallets[0];
      const walletData: SolanaWallet | undefined = solanaWallet
        ? {
            address: solanaWallet.address,
            type: solanaWallet.walletClientType === "privy" ? "embedded" : "external",
            name: solanaWallet.walletClientType,
          }
        : undefined;

      setUser({
        id: user.id,
        email: user.email?.address,
        wallet: walletData,
        createdAt: new Date(user.createdAt),
      });

      if (walletData) {
        setWallet(walletData);
        fetchBalance(walletData.address);
      }
    } else {
      storeLogout();
    }
  }, [ready, authenticated, user, wallets, setUser, setWallet, setLoading, storeLogout]);

  const fetchBalance = async (address: string) => {
    setBalanceLoading(true);
    try {
      const rpcUrl =
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
        "https://api.mainnet-beta.solana.com";

      // Fetch USDC token account balance
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [
            address,
            { mint: USDC_MINT },
            { encoding: "jsonParsed" },
          ],
        }),
      });

      const data = await response.json();
      const accounts = data.result?.value || [];

      if (accounts.length > 0) {
        const usdcAmount =
          accounts[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
        setBalance(usdcAmount);
      } else {
        setBalance(0);
      }
    } catch (error) {
      console.error("Failed to fetch USDC balance:", error);
      setBalance(0);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setDropdownOpen(false);
    await logout();
    storeLogout();
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatBalance = (bal: number) => {
    if (bal >= 1000) {
      return `$${(bal / 1000).toFixed(1)}k`;
    }
    return `$${bal.toFixed(2)}`;
  };

  // Loading state
  if (!ready) {
    return (
      <div className="h-10 w-32 rounded-xl bg-muted/50 animate-pulse" />
    );
  }

  // Not authenticated - show connect button
  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#176a91] to-[#1E81B0] text-white font-semibold text-sm shadow-lg shadow-[#1E81B0]/25 hover:shadow-[#1E81B0]/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        <i className="icon-[lucide--wallet] w-4 h-4" />
        Connect Wallet
      </button>
    );
  }

  // Authenticated - show wallet info with dropdown
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all",
          "bg-muted/50 border-border/50 hover:bg-muted hover:border-primary/30",
          dropdownOpen && "bg-muted border-primary/30"
        )}
      >
        {/* Wallet icon */}
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1E81B0] to-[#4AADD8] flex items-center justify-center">
          <i className="icon-[lucide--wallet] w-3.5 h-3.5 text-white" />
        </div>

        {/* Address and balance */}
        <div className="flex flex-col items-start">
          <span className="text-sm font-medium">
            {wallet ? formatAddress(wallet.address) : "Connected"}
          </span>
          <span className="text-xs text-muted-foreground">
            {balanceLoading ? (
              <span className="animate-pulse">Loading...</span>
            ) : (
              formatBalance(balance)
            )}
          </span>
        </div>

        {/* Dropdown indicator */}
        <i
          className={cn(
            "icon-[lucide--chevron-down] w-4 h-4 text-muted-foreground transition-transform",
            dropdownOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown menu */}
      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border/50 bg-card/95 backdrop-blur-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Wallet address */}
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1E81B0] to-[#4AADD8] flex items-center justify-center">
                <i className="icon-[lucide--wallet] w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {wallet ? formatAddress(wallet.address) : "Wallet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {wallet?.type === "embedded" ? "Privy Wallet" : wallet?.name || "External"}
                </p>
              </div>
            </div>
          </div>

          {/* Balance */}
          <div className="p-4 border-b border-border/50">
            <p className="text-xs text-muted-foreground mb-1">USDC Balance</p>
            <p className="text-lg font-bold">
              {balanceLoading ? (
                <span className="animate-pulse">...</span>
              ) : (
                `$${balance.toFixed(2)}`
              )}
            </p>
          </div>

          {/* Actions */}
          <div className="p-2">
            <button
              onClick={() => wallet && fetchBalance(wallet.address)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <i className="icon-[lucide--refresh-cw] w-4 h-4" />
              Refresh Balance
            </button>
            <button
              onClick={() => {
                if (wallet) {
                  navigator.clipboard.writeText(wallet.address);
                  setDropdownOpen(false);
                }
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <i className="icon-[lucide--copy] w-4 h-4" />
              Copy Address
            </button>
            <button
              onClick={handleDisconnect}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <i className="icon-[lucide--log-out] w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Main export - decides which button to render based on Privy config
export function WalletButton() {
  const { isConfigured } = usePrivyConfig();

  if (!isConfigured) {
    return <DisabledWalletButton />;
  }

  return <ActiveWalletButton />;
}
