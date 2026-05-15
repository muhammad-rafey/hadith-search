import type { Metadata, Viewport } from "next";
import { Amiri, Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://hadithapp.tld"),
  title: {
    default: "Hadith Search · Sahih al-Bukhari",
    template: "%s · Hadith Search",
  },
  description:
    "Semantic search over Sahih al-Bukhari with full Arabic text, English translation, and references.",
  applicationName: "Hadith Search",
  authors: [{ name: "Hadith Search" }],
  openGraph: {
    type: "website",
    siteName: "Hadith Search",
    title: "Hadith Search · Sahih al-Bukhari",
    description:
      "Semantic search over Sahih al-Bukhari with full Arabic text, English translation, and references.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${amiri.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
