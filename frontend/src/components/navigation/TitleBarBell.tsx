"use client";

import React from "react";
import { Bell } from "lucide-react";
import { useAppContext } from "@/context/AppContext";

export function TitleBarBell() {
    const { alerts } = useAppContext();
    const hasTriggered = alerts?.some(a => a.triggered);
    const hasActive = alerts?.some(a => a.active);
    
    const color = hasTriggered ? '#CA8A04' 
                : hasActive ? 'rgba(250,250,249,0.7)'
                : 'rgba(250,250,249,0.4)';

    return (
        <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-alerts-panel'))}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md hover:bg-[#FAFAF9]/10 transition-colors duration-200 cursor-default group"
            style={{ WebkitAppRegion: 'no-drag' } as any}
        >
            <Bell size={14} color={color} />
            
            {hasTriggered && (
                <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#CA8A04] animate-pulse pointer-events-none" />
            )}

            {/* Tooltip */}
            <div className="absolute top-full right-0 mt-1 px-2 py-1 bg-[#1C1917] text-[#FAFAF9] text-[10px] rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 ease-out whitespace-nowrap z-50">
                Alerts
            </div>
        </button>
    );
}
