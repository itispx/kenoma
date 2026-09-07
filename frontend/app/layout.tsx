import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

// The interface's primary voice — headings, buttons, body copy. Inter rather
// than a display face: this UI runs at 12-14px in dense tables, and Inter is
// drawn and hinted for exactly that (tall x-height, open apertures, stems that
// land on pixel boundaries). Monospace (above) stays reserved for genuinely
// data-shaped content — IDs, keys, diffs — not the whole UI, so the product
// reads as a sleek console rather than a literal terminal emulator.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kenoma",
  description:
    "Documentation review console — import, edit, review, and approve revisions.",
  // The mark ships in two tones; browsers that honour `media` on icon links pick
  // the one that reads against their own chrome. `favicon.ico` (dark mark) is the
  // fallback for everything else, including the bare /favicon.ico request.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      {
        url: "/favicon-light.png",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicon-dark.png",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-console-950 text-console-50">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
