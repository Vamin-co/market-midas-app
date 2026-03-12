"use client";

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/AppContext';

export function useSignIn() {
    const router = useRouter();
    const { setIsAuthenticated } = useAppContext();
    const [email, setEmail] = useState('demo@market-midas.com');
    const [password, setPassword] = useState('institutional2024');
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    const handleSignIn = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        setIsAuthenticating(true);
        // Simulate network request
        setTimeout(() => {
            setIsAuthenticated(true);
            router.push('/');
        }, 1500);
    }, [setIsAuthenticated, router]);

    return {
        email,
        setEmail,
        password,
        setPassword,
        isAuthenticating,
        handleSignIn,
    };
}
