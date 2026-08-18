import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const imageUrl = new URL("/og.png", metadataBase).toString();
  return {
    metadataBase,
    title: {
      default: "Homework Helper",
      template: "%s · Homework Helper",
    },
    description:
      "A calm, explainable homework planner with smart scheduling, focus sessions, class workspaces, and source-aware tutoring.",
    applicationName: "Homework Helper",
    manifest: "/manifest.webmanifest",
    openGraph: {
      title: "Homework Helper",
      description: "Plan the work. Protect your time. Learn with context.",
      type: "website",
      images: [{ url: imageUrl, width: 1536, height: 896, alt: "Homework Helper planning workspace" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Homework Helper",
      description: "Plan the work. Protect your time. Learn with context.",
      images: [imageUrl],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#111816" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
