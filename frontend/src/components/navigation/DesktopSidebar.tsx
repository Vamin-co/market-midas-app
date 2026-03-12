"use client";

import React from "react";
import Link from "next/link";
import { useAppContext } from "@/context/AppContext";
import { useNavBar } from "@/hooks/useNavBar";

export function DesktopSidebar() {
    const { executionMode } = useAppContext();
    const { isActive } = useNavBar();

    const isPaper = executionMode === "PAPER";

    const navItems = [
        { name: "Analyze", path: "/", icon: "search" },
        { name: "Positions", path: "/positions", icon: "candlestick_chart" },
        { name: "Settings", path: "/settings", icon: "settings" },
    ];

    return (
        <nav
            className={`w-16 h-full bg-[#141210] flex flex-col shrink-0 relative z-40 ${isPaper ? "border-r border-[#CA8A04]/20" : "border-r border-[#FAFAF9]/8"
                }`}
        >
            <div className="flex-1 flex flex-col items-center gap-6 pt-12">
                {navItems.map((item) => {
                    const active = isActive(item.path);
                    return (
                        <Link
                            key={item.name}
                            href={item.path}
                            className={`group flex items-center justify-center w-full h-10 relative transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] ${active ? "text-[#CA8A04] scale-100" : "text-[#FAFAF9]/30 hover:text-[#FAFAF9]/70 hover:scale-[1.03]"
                                }`}
                            style={{ WebkitAppRegion: "no-drag" } as any}
                        >
                            {active && (
                                <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#CA8A04]" />
                            )}
                            <span className="material-symbols-outlined text-[20px]" style={{ WebkitAppRegion: "no-drag" } as any}>
                                {item.icon}
                            </span>

                            {/* Tooltip */}
                            <div className="absolute left-16 px-2 py-1 bg-[#1C1917] text-[#FAFAF9] text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 shadow-sm ml-2">
                                {item.name}
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Mode Badge at bottom */}
            <Link
                href="/settings"
                className="pb-8 w-full flex flex-col items-center justify-center gap-1 group"
                style={{ WebkitAppRegion: "no-drag" } as any}
            >
                {isPaper ? (
                    <div className="text-[9px] font-bold uppercase tracking-widest text-[#CA8A04]/60 group-hover:text-[#CA8A04]/80 transition-colors">
                        PAPER
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-1 group-hover:opacity-80 transition-opacity">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#27c93f]" />
                        <span className="text-[9px] font-bold uppercase tracking-widest text-[#FAFAF9]/50">
                            LIVE
                        </span>
                    </div>
                )}
            </Link>
        </nav>
    );
}
