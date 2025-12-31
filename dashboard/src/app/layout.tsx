import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/components/Nav";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Agent Reflection",
  description: "Developer activity tracking and insights",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100`}>
        <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Agent Reflection
          </Link>
          <Nav />
        </header>
        {children}
      </body>
    </html>
  );
}
