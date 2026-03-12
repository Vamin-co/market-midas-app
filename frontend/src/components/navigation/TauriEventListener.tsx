"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { listen } from "@tauri-apps/api/event";

export function TauriEventListener() {
    const router = useRouter();

    useEffect(() => {
        // Only run in the browser/Tauri environment
        if (typeof window === "undefined" || !(window as any).__TAURI__) return;

        const unlistens: (() => void)[] = [];

        async function setupListeners() {
            try {
                const unlistenSettings = await listen("navigate-settings", () => {
                    router.push("/settings");
                });
                unlistens.push(unlistenSettings);
            } catch (err) {
                console.error("Failed to set up Tauri event listeners:", err);
            }
        }

        setupListeners();

        return () => {
            unlistens.forEach((unlisten) => unlisten());
        };
    }, [router]);

    return null;
}
