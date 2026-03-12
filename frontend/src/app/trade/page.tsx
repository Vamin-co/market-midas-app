"use client";

import { useSearchParams } from 'next/navigation'
import { ExecutionInterlock } from '@/components/dashboard/ExecutionInterlock'
import { Suspense } from 'react'

function TradePageContent() {
    const searchParams = useSearchParams()
    const ticker = searchParams.get('ticker') || ''
    const action = searchParams.get('action') || 'BUY'
    const owned = searchParams.get('owned') === 'true'

    return (
        <div className="h-full w-full overflow-hidden">
            <ExecutionInterlock
                ticker={ticker}
                action={action}
                owned={owned}
            />
        </div>
    )
}

export default function TradePage() {
    return (
        <Suspense fallback={<div className="h-full w-full bg-[#FAFAF9]" />}>
            <TradePageContent />
        </Suspense>
    )
}
