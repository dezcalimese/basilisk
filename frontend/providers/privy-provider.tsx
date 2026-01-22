"use client";

import { createContext, useContext } from "react";
import { PrivyProvider as PrivyProviderBase } from "@privy-io/react-auth";

// Context to track if Privy is configured
const PrivyConfigContext = createContext<{ isConfigured: boolean }>({ isConfigured: false });

export function usePrivyConfig() {
  return useContext(PrivyConfigContext);
}

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // In development without Privy configured, render children with context
    console.warn("NEXT_PUBLIC_PRIVY_APP_ID not set - Privy auth disabled");
    return (
      <PrivyConfigContext.Provider value={{ isConfigured: false }}>
        {children}
      </PrivyConfigContext.Provider>
    );
  }

  return (
    <PrivyConfigContext.Provider value={{ isConfigured: true }}>
      <PrivyProviderBase
        appId={appId}
        config={{
          // Appearance
          appearance: {
            theme: "dark",
            accentColor: "#1E81B0", // basilisk blue
            logo: "/basilisk-logo.png",
            showWalletLoginFirst: false,
          },
          // Embedded wallet configuration
          embeddedWallets: {
            ethereum: {
              createOnLogin: "users-without-wallets",
            },
            solana: {
              createOnLogin: "users-without-wallets",
            },
          },
          // Login methods
          loginMethods: ["email", "wallet", "google", "twitter"],
        }}
      >
        {children}
      </PrivyProviderBase>
    </PrivyConfigContext.Provider>
  );
}
