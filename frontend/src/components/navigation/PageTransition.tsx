"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [opacity, setOpacity] = useState("opacity-0");

    useEffect(() => {
        setOpacity("opacity-0");
        const timer = setTimeout(() => {
            setOpacity("opacity-100");
        }, 10);
        return () => clearTimeout(timer);
    }, [pathname]);

    return (
        <div className={`transition-opacity duration-150 ease-out flex-1 w-full h-full flex flex-col ${opacity}`}>
            {children}
        </div>
    );
}
