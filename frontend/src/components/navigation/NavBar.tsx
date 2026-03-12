"use client";

import React from 'react';
import Link from 'next/link';
import { useNavBar } from '@/hooks/useNavBar';

export const NavBar = () => {
    const { pathname, isAuthenticated, handleSignOut, isActive } = useNavBar();

    return (
        <nav className="w-full bg-[#F9F8F6] border-b border-hairline-gold sticky top-0 z-50 shadow-sm">
            <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">

                {/* Logo / Brand Identity */}
                <Link href="/" className="flex items-center gap-3 group">
                    <div className="size-10 bg-[#1C1917] flex items-center justify-center shrink-0 group-hover:bg-[#CA8A04] transition-colors">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 21L12 4L21 21" stroke="currentColor" className="text-[#CA8A04] group-hover:text-[#1C1917] transition-colors" strokeWidth="2" strokeLinecap="square" />
                            <path d="M8 12L12 18L16 12" stroke="#FAFAF9" strokeWidth="2" strokeLinecap="square" />
                        </svg>
                    </div>
                    <div className="flex flex-col justify-center">
                        <span className="font-serif font-bold text-xl leading-none text-[#1C1917] tracking-tight">Market-Midas</span>
                        <span className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mt-1">Institutional</span>
                    </div>
                </Link>

                {/* Minimal Desktop Nav Links */}
                <div className="hidden md:flex items-center gap-8 font-sans text-xs font-semibold tracking-widest uppercase">
                    <Link href="/" className={`transition-all duration-300 ease-out border-b-[1.5px] py-1 ${pathname === '/' ? 'text-[#1C1917] border-[#CA8A04]' : 'text-[#6A6A6A] border-transparent hover:text-[#1C1917] hover:border-hairline-gold'}`}>
                        Workspace
                    </Link>
                    <Link href="/methodology" className={`transition-all duration-300 ease-out border-b-[1.5px] py-1 ${pathname === '/methodology' ? 'text-[#1C1917] border-[#CA8A04]' : 'text-[#6A6A6A] border-transparent hover:text-[#1C1917] hover:border-hairline-gold'}`}>
                        Methodology
                    </Link>
                    <Link href="/engine-specs" className={`transition-all duration-300 ease-out border-b-[1.5px] py-1 ${pathname === '/engine-specs' ? 'text-[#1C1917] border-[#CA8A04]' : 'text-[#6A6A6A] border-transparent hover:text-[#1C1917] hover:border-hairline-gold'}`}>
                        Engine Specs
                    </Link>
                    <Link href="/settings" className={`transition-all duration-300 ease-out border-b-[1.5px] py-1 flex items-center gap-1.5 ${pathname === '/settings' ? 'text-[#1C1917] border-[#CA8A04]' : 'text-[#6A6A6A] border-transparent hover:text-[#1C1917] hover:border-hairline-gold'}`}>
                        <span className="material-symbols-outlined text-[12px]">settings</span>
                        Settings
                    </Link>
                </div>

                {/* Utility / Auth State */}
                <div className="flex items-center gap-4">
                    {isAuthenticated ? (
                        <>
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white border border-hairline rounded-sm shadow-sm ring-1 ring-black/5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] animate-pulse"></span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-stone-600">demo@market-midas.com</span>
                            </div>
                            <div className="hidden sm:block h-4 w-[1px] bg-stone-300 mx-2"></div>
                            <button
                                onClick={handleSignOut}
                                className="text-stone-500 font-sans text-[10px] font-bold uppercase tracking-widest hover:text-[#B91C1C] transition-colors duration-200 ease-out flex items-center gap-1 group"
                            >
                                Sign Out
                                <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform duration-200">logout</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <Link href="/sign-in" className={`font-sans text-xs font-bold uppercase tracking-widest transition-colors duration-200 ease-out ${pathname === '/sign-in' ? 'text-[#CA8A04]' : 'text-[#1C1917] hover:text-[#CA8A04]'}`}>
                                Sign In
                            </Link>
                            <div className="h-4 w-[1px] bg-hairline"></div>
                            <Link href="/request-access" className="bg-[#1C1917] text-[#FAFAF9] font-sans text-xs font-bold uppercase tracking-wider px-6 py-2.5 rounded-none hover:bg-[#CA8A04] hover:text-[#1C1917] transition-all duration-300 ease-out inline-block text-center border border-[#1C1917] hover:border-[#CA8A04] shadow-sm">
                                Request Access
                            </Link>
                        </>
                    )}
                </div>

            </div>
        </nav>
    );
};
