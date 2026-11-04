import type { Metadata, Viewport } from "next";
import { Fredoka, Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { AnalysisProvider } from "@/components/AnalysisProvider";
import { ServiceWorker } from "@/components/ServiceWorker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Blunder Buster",
  description: "Your fun chess coach that hunts down your blunders.",
  applicationName: "Blunder Buster",
  // iPhone "Add to Home Screen" (iOS ignores most of the web manifest).
  appleWebApp: { capable: true, title: "Blunder Buster", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the phone tab bar reach the screen edge; it pads itself with the safe-area insets.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8b86d" },
    { media: "(prefers-color-scheme: dark)", color: "#2b2119" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${fredoka.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ServiceWorker />
        <AuthProvider>
          <AnalysisProvider>
            <AppShell>{children}</AppShell>
          </AnalysisProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
