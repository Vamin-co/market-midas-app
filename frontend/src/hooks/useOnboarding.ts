"use client";

import { useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';

export function useOnboarding() {
    const {
        onboardingStep, setOnboardingStep,
        apiKey, setApiKey,
        complianceAccepted, setComplianceAccepted,
        setCurrentRoute
    } = useAppContext();

    const handleNext = useCallback(() => {
        if (onboardingStep === "WELCOME") setOnboardingStep("API_KEY");
        else if (onboardingStep === "API_KEY") {
            // Immediate simplistic validation
            if (apiKey.trim().length > 10) setOnboardingStep("COMPLIANCE");
        }
        else if (onboardingStep === "COMPLIANCE") {
            if (complianceAccepted) {
                setOnboardingStep("COMPLETED");
                setCurrentRoute("COMMAND_CENTER"); // Navigate to Command Center
            }
        }
    }, [onboardingStep, apiKey, complianceAccepted, setOnboardingStep, setCurrentRoute]);

    const isApiKeyValid = apiKey.length > 10;

    return {
        onboardingStep,
        apiKey,
        setApiKey,
        complianceAccepted,
        setComplianceAccepted,
        handleNext,
        isApiKeyValid,
    };
}
