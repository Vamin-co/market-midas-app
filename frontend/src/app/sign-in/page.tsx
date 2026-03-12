"use client";

import React from 'react';
import Link from 'next/link';
import { useSignIn } from '@/hooks/useSignIn';

export default function SignInPage() {
    const {
        email,
        setEmail,
        password,
        setPassword,
        isAuthenticating,
        handleSignIn,
    } = useSignIn();

    return (
        <main className="min-h-[calc(100vh-80px)] bg-[#FAFAF9] flex items-center justify-center p-6 font-poppins text-[#1C1917] selection:bg-[#CA8A04]/20 relative overflow-hidden">

            {/* Minimalist Watermark Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none select-none -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-stone-100/50 via-[#FAFAF9] to-[#FAFAF9]">
            </div>

            <div className="w-full max-w-5xl flex flex-col md:flex-row bg-white border border-stone-200 shadow-xl relative z-10 animate-in fade-in zoom-in-95 duration-700">

                {/* Left Side: Brand Imagery */}
                <div className="w-full md:w-1/2 bg-[#1C1917] p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden text-white">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#CA8A04]/10 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

                    <div>
                        <div className="size-12 bg-[#CA8A04] flex items-center justify-center mb-8 shadow-sm">
                            <span className="material-symbols-outlined text-[#1C1917] text-2xl">account_balance</span>
                        </div>
                        <h2 className="font-serif text-4xl lg:text-5xl font-bold leading-[1.1] mb-6">
                            Institutional<br />Intelligence,<br />Authorized.
                        </h2>
                        <p className="text-stone-400 font-poppins text-sm leading-relaxed max-w-sm">
                            Access the sovereign multi-agent execution pipeline. All sessions are logged and cryptographically signed.
                        </p>
                    </div>

                    <div className="mt-16 md:mt-24 pt-8 border-t border-stone-800 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-stone-500">Secure Node</span>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#15803D] animate-pulse"></span>
                            <span className="text-[10px] font-bold uppercase tracking-widest">System Online</span>
                        </div>
                    </div>
                </div>

                {/* Right Side: Sign In Form */}
                <div className="w-full md:w-1/2 p-12 lg:p-16 flex flex-col justify-center bg-white">
                    <div className="mb-10">
                        <h1 className="text-3xl font-serif font-bold text-[#1C1917] mb-2">Auth Gateway</h1>
                        <p className="text-sm font-poppins text-stone-500">Enter your credentials to access the console.</p>
                    </div>

                    <form onSubmit={handleSignIn} className="flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[#1C1917]">Work Email</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-stone-400 text-lg">mail</span>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full h-14 pl-12 pr-4 bg-white border border-hairline focus:border-[#CA8A04] focus:ring-1 focus:ring-[#CA8A04]/20 text-[#1C1917] font-medium transition-all placeholder:text-stone-400 shadow-sm"
                                    placeholder="name@fund.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-[#1C1917]">Passphrase</label>
                                <a href="#" className="text-[10px] font-bold uppercase tracking-widest text-[#CA8A04] hover:text-[#1C1917] transition-colors">Reset</a>
                            </div>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-stone-400 text-lg">lock</span>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full h-14 pl-12 pr-4 bg-white border border-hairline focus:border-[#CA8A04] focus:ring-1 focus:ring-[#CA8A04]/20 text-[#1C1917] font-medium transition-all placeholder:text-stone-400 shadow-sm"
                                    placeholder="••••••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <div className="mt-4">
                            <button
                                type="submit"
                                disabled={isAuthenticating}
                                className="w-full h-14 bg-[#1C1917] text-[#FAFAF9] font-bold text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-[#CA8A04] hover:text-[#1C1917] transition-all duration-300 disabled:opacity-50 group shadow-md hover:shadow-lg"
                            >
                                {isAuthenticating ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                                        Authenticating...
                                    </>
                                ) : (
                                    <>
                                        Establish Connection
                                        <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">login</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>

                    <div className="mt-10 text-center border-t border-stone-100 pt-8">
                        <p className="text-xs font-poppins text-stone-500">
                            Firm not registered? <Link href="/request-access" className="font-bold text-[#1C1917] hover:text-[#CA8A04] uppercase tracking-widest ml-1 transition-colors">Request Access</Link>
                        </p>
                    </div>
                </div>

            </div>
        </main>
    );
}
