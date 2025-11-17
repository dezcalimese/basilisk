import type { Metadata } from "next";
import { Montserrat, Hind } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

const hind = Hind({
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-hind",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Basilisk - Trading Analytics",
  description: "A serpent's eye for mispriced markets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${montserrat.variable} ${hind.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
