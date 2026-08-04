import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

// The interface's primary voice — headings, buttons, body copy. Monospace
// (above) is reserved for genuinely data-shaped content (IDs, diffs, code),
// not the whole UI, so the product reads as a sleek console rather than a
// literal terminal emulator.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kenoma",
  description: "Documentation review console — import, edit, review, and approve revisions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-console-950 text-console-50 antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
