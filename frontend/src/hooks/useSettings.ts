"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';

export function useSettings() {
    const { userPreferences, updatePreferences, refreshPreferences } = useAppContext();

    const [walletBalance, setWalletBalance] = useState('');
    const [defaultTradeSize, setDefaultTradeSize] = useState('');
    const [alertThreshold, setAlertThreshold] = useState('');
    const [maxDailyDrawdown, setMaxDailyDrawdown] = useState('');
    const [stopLossThreshold, setStopLossThreshold] = useState('');
    const [apiKey, setApiKey] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);

    // Populate fields from context
    useEffect(() => {
        setWalletBalance(userPreferences.walletBalance.toString());
        setDefaultTradeSize(userPreferences.defaultTradeSize.toString());
        setAlertThreshold(userPreferences.alertThreshold.toString());
        setMaxDailyDrawdown(userPreferences.maxDailyDrawdown.toString());
        setStopLossThreshold(userPreferences.stopLossThreshold.toString());
        setApiKey(userPreferences.apiKey || '');
    }, [userPreferences]);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        setSaveStatus('idle');
        setErrorMsg('');

        try {
            const payload: Record<string, any> = {};

            const balVal = parseFloat(walletBalance);
            const tradeVal = parseFloat(defaultTradeSize);
            const alertVal = parseFloat(alertThreshold);
            const drawdownVal = parseFloat(maxDailyDrawdown);

            if (isNaN(balVal) || balVal < 0) {
                throw new Error('Wallet balance must be a non-negative number.');
            }
            if (isNaN(tradeVal) || tradeVal < 0) {
                throw new Error('Default trade size must be a non-negative number.');
            }
            if (tradeVal > balVal) {
                throw new Error('Default trade size cannot exceed wallet balance.');
            }
            if (isNaN(alertVal) || alertVal < 0) {
                throw new Error('Alert threshold must be a non-negative number.');
            }
            if (isNaN(drawdownVal) || drawdownVal <= 0 || drawdownVal > 100) {
                throw new Error('Max daily drawdown must be between 0 and 100%.');
            }

            const stopLossVal = parseFloat(stopLossThreshold);
            if (isNaN(stopLossVal) || stopLossVal <= 0) {
                throw new Error('Stop-loss alert threshold must be a positive number.');
            }

            payload.walletBalance = balVal;
            payload.defaultTradeSize = tradeVal;
            payload.alertThreshold = alertVal;
            payload.maxDailyDrawdown = drawdownVal;
            payload.stopLossThreshold = stopLossVal;

            // Only send apiKey if user changed it (not masked value)
            if (apiKey && !apiKey.startsWith('••••')) {
                payload.apiKey = apiKey;
            } else {
                payload.apiKey = userPreferences.apiKey;
            }

            await updatePreferences(payload);
            await refreshPreferences();
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (err: any) {
            setErrorMsg(err.message || 'Failed to save settings.');
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    }, [walletBalance, defaultTradeSize, alertThreshold, maxDailyDrawdown, stopLossThreshold, apiKey, userPreferences, updatePreferences, refreshPreferences]);

    const toggleApiKeyVisibility = useCallback(() => {
        setShowApiKey(prev => !prev);
    }, []);

    return {
        // Form state
        walletBalance,
        setWalletBalance,
        defaultTradeSize,
        setDefaultTradeSize,
        alertThreshold,
        setAlertThreshold,
        maxDailyDrawdown,
        setMaxDailyDrawdown,
        stopLossThreshold,
        setStopLossThreshold,
        apiKey,
        setApiKey,
        showApiKey,

        // Save state
        isSaving,
        saveStatus,
        errorMsg,

        // Derived
        apiKeySet: userPreferences.apiKeySet,

        // Handlers
        handleSave,
        toggleApiKeyVisibility,
    };
}
