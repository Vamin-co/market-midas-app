import type { Metadata } from "next";
import { Jost, Bodoni_Moda } from "next/font/google";
import { AppProvider } from "@/context/AppContext";
import { DesktopSidebar } from "@/components/navigation/DesktopSidebar";
import { PageTransition } from "@/components/navigation/PageTransition";
import { TauriEventListener } from "@/components/navigation/TauriEventListener";
import { AlertsPanel } from "@/components/navigation/AlertsPanel";
import { AddAlertModal } from "@/components/modals/AddAlertModal";
import { TitleBarBell } from "@/components/navigation/TitleBarBell";
import "./globals.css";

const jost = Jost({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const bodoniModa = Bodoni_Moda({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Market Midas",
  description: "Human-in-the-loop automated trading assistant dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      </head>
      <body className={`${jost.variable} ${bodoniModa.variable} min-h-screen bg-[var(--background)] antialiased selection:bg-[#CA8A04]/20 selection:text-[#1C1917] scrollbar-thin scrollbar-thumb-stone-300 scrollbar-track-transparent text-[var(--primary)] font-sans`}>
        <AppProvider>
          <TauriEventListener />
          <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#141210]">
            {/* Row 1: Title bar */}
            <div
              className="w-full h-8 shrink-0 bg-[#141210] relative flex items-center justify-center select-none"
              data-tauri-drag-region
              style={{ WebkitAppRegion: "drag", appRegion: "drag" } as any}
            >
              <span className="text-xs font-medium text-[#FAFAF9]/80 pointer-events-none" data-tauri-drag-region>Market Midas</span>
              <TitleBarBell />
            </div>

            {/* Row 2: App body */}
            <div className="flex flex-row flex-1 overflow-hidden">
              <DesktopSidebar />
              <main className="flex-1 h-full overflow-auto bg-[var(--background)] relative" style={{ WebkitAppRegion: "no-drag" } as any}>
                <PageTransition>
                  {children}
                </PageTransition>
              </main>
              
              <AlertsPanel />
              <AddAlertModal />
            </div>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
