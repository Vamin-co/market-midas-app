"use client";

import React from 'react';
import { useOnboarding } from '@/hooks/useOnboarding';

export default function OnboardingFlow() {
    const {
        onboardingStep,
        apiKey,
        setApiKey,
        complianceAccepted,
        setComplianceAccepted,
        handleNext,
        isApiKeyValid,
    } = useOnboarding();

    return (
        <div className="flex h-screen w-full items-center justify-center bg-[var(--color-deep-slate)] text-[var(--color-primary)] font-sans" data-tauri-drag-region>
            <div className="max-w-md w-full p-10 bg-[#1C1917] rounded-2xl shadow-2xl border border-white/5 relative flex flex-col gap-6">

                {/* Step 1: Value Proposition */}
                {onboardingStep === "WELCOME" && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h1 className="font-serif text-3xl text-[#FAFAF9] font-bold">Welcome to Market Midas</h1>
                        <p className="text-[#44403C] font-light leading-relaxed">
                            Experience the convergence of Anthropic reasoning and institutional trade execution, mapped directly into your native macOS workstation.
                        </p>
                        <button
                            onClick={handleNext}
                            className="mt-4 bg-[#CA8A04] text-[#1C1917] px-8 py-3 rounded-md font-bold uppercase tracking-widest text-xs hover:bg-[#A16207] transition-colors self-start"
                        >
                            Initialize Agent
                        </button>
                    </div>
                )}

                {/* Step 2: API Key Input */}
                {onboardingStep === "API_KEY" && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h1 className="font-serif text-3xl text-[#FAFAF9] font-bold">Authentication</h1>
                        <p className="text-[#44403C] font-light text-sm">
                            Please provide your secure broker API key to initialize local execution protocols. Keys are never transmitted off-device.
                        </p>
                        <input
                            type="password"
                            placeholder="sk-..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="w-full bg-[#141210] border border-white/10 rounded-md p-3 text-[#FAFAF9] font-mono focus:outline-none focus:border-[#CA8A04] transition-colors mt-2 text-sm"
                            autoFocus
                        />
                        <button
                            onClick={handleNext}
                            disabled={apiKey.length <= 10}
                            className={`mt-4 px-8 py-3 rounded-md font-bold uppercase tracking-widest text-xs transition-colors self-start ${apiKey.length > 10 ? 'bg-[#CA8A04] text-[#1C1917] hover:bg-[#A16207]' : 'bg-white/5 text-white/30 cursor-not-allowed'}`}
                        >
                            Verify Connection
                        </button>
                    </div>
                )}

                {/* Step 3: Compliance Consent */}
                {onboardingStep === "COMPLIANCE" && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h1 className="font-serif text-3xl text-[#FAFAF9] font-bold">Compliance Rules</h1>
                        <p className="text-[#44403C] font-light text-sm">
                            I acknowledge that Market Midas provides deterministic AI trade arguments, but all capital risk resides strictly with the executing party.
                        </p>
                        <label className="flex items-start gap-3 mt-2 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={complianceAccepted}
                                onChange={(e) => setComplianceAccepted(e.target.checked)}
                                className="mt-1 accent-[#CA8A04] w-4 h-4"
                            />
                            <span className="text-[#FAFAF9] text-sm group-hover:text-white transition-colors">
                                I accept the institutional risk parameters.
                            </span>
                        </label>
                        <button
                            onClick={handleNext}
                            disabled={!complianceAccepted}
                            className={`mt-4 px-8 py-3 rounded-md font-bold uppercase tracking-widest text-xs transition-colors self-start ${complianceAccepted ? 'bg-[#27c93f] text-[#141210] hover:bg-[#1fa133]' : 'bg-white/5 text-white/30 cursor-not-allowed'}`}
                        >
                            Enter Command Center
                        </button>
                    </div>
                )}

                {/* Custom Progress Dots */}
                <div className="absolute top-6 right-6 flex gap-2">
                    {["WELCOME", "API_KEY", "COMPLIANCE"].map((s, idx) => (
                        <div
                            key={s}
                            className={`w-2 h-2 rounded-full transition-colors ${(s === onboardingStep || (idx === 0 && onboardingStep !== "WELCOME") || (idx === 1 && onboardingStep === "COMPLIANCE"))
                                ? 'bg-[#CA8A04]' : 'bg-white/10'
                                }`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
