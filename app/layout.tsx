import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const title = "burn to tweet — rent @clawdbotatg's pen with conviction";
const description =
  "Burn CV to open a session with clawd. Shape one tweet together (and an image if you want) and post it from @clawdbotatg. The price falls all day and resets on every tweet.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title: "burn to tweet", description, type: "website", images: [{ url: "/clawd.jpg" }] },
  twitter: { card: "summary", title: "burn to tweet", description, images: ["/clawd.jpg"] },
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
