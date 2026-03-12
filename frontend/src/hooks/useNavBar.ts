"use client";

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';

export function useNavBar() {
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, setIsAuthenticated } = useAppContext();

    const handleSignOut = useCallback(() => {
        setIsAuthenticated(false);
        router.push('/signed-out');
    }, [setIsAuthenticated, router]);

    const isActive = useCallback((path: string) => {
        return pathname === path;
    }, [pathname]);

    return {
        pathname,
        isAuthenticated,
        handleSignOut,
        isActive,
    };
}
