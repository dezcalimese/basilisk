import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WalletType = "embedded" | "external";

export interface SolanaWallet {
  address: string;
  type: WalletType;
  name?: string;
}

export interface User {
  id: string;
  email?: string;
  wallet?: SolanaWallet;
  createdAt: Date;
}

interface AuthState {
  // User state
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Wallet state
  wallet: SolanaWallet | null;
  balance: number; // USDC balance in dollars
  balanceLoading: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setWallet: (wallet: SolanaWallet | null) => void;
  setBalance: (balance: number) => void;
  setBalanceLoading: (loading: boolean) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  wallet: null,
  balance: 0,
  balanceLoading: false,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          wallet: user?.wallet || null,
        }),

      setWallet: (wallet) =>
        set((state) => ({
          wallet,
          user: state.user ? { ...state.user, wallet: wallet || undefined } : null,
        })),

      setBalance: (balance) => set({ balance }),

      setBalanceLoading: (balanceLoading) => set({ balanceLoading }),

      setLoading: (isLoading) => set({ isLoading }),

      logout: () =>
        set({
          ...initialState,
          isLoading: false,
        }),
    }),
    {
      name: "basilisk-auth",
      partialize: (state) => ({
        // Only persist non-sensitive data
        user: state.user
          ? {
              id: state.user.id,
              email: state.user.email,
              createdAt: state.user.createdAt,
            }
          : null,
      }),
    }
  )
);

// Selector hooks for common patterns
export const useIsAuthenticated = () =>
  useAuthStore((state) => state.isAuthenticated);

export const useWallet = () => useAuthStore((state) => state.wallet);

export const useBalance = () => useAuthStore((state) => state.balance);
