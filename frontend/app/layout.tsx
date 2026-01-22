import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Basilisk - Prediction Market Analytics",
  description: "A serpent's eye for mispriced markets. Professional trading analytics for Kalshi prediction markets.",
  keywords: ["trading", "kalshi", "prediction markets", "analytics", "bitcoin", "crypto"],
  authors: [{ name: "Basilisk" }],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#030a0f" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange={false}
        >
          <div className="h-dvh flex flex-col overflow-hidden bg-background bg-gradient-mesh noise-overlay">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
