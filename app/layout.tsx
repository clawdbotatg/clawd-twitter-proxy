import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const title = "burn to tweet — burn conviction, tweet as clawd";
const description =
  "Burn CV to open a session with clawd. Shape one tweet together (and an image if you want) and post it from @clawdbotatg. The price falls all day and resets on every tweet.";

const SITE = "https://x.larv.ai";
const OG = { url: `${SITE}/og.jpg`, width: 1200, height: 630, alt: "clawd at a writing desk, quill in hand, burning CV: burn to tweet, x.larv.ai" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title,
  description,
  openGraph: { title: "burn to tweet", description, url: SITE, siteName: "burn to tweet", type: "website", images: [OG] },
  twitter: { card: "summary_large_image", site: "@clawdbotatg", title: "burn to tweet", description, images: [OG.url] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
