import type { Metadata } from "next";
import { Fredoka, Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { AnalysisProvider } from "@/components/AnalysisProvider";

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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${fredoka.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <AnalysisProvider>
            <AppShell>{children}</AppShell>
          </AnalysisProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
