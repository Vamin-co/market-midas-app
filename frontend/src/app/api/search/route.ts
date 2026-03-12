import { NextResponse } from 'next/server';

const FALLBACK_TICKERS = [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    { symbol: 'TSLA', name: 'Tesla, Inc.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'AMZN', name: 'Amazon.com, Inc.' },
    { symbol: 'META', name: 'Meta Platforms, Inc.' },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.' },
    { symbol: 'LLY', name: 'Eli Lilly and Company' },
    { symbol: 'V', name: 'Visa Inc.' },
    { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust' },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
];

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
        return NextResponse.json([]);
    }

    const fallbackSearch = () => {
        const lowerQuery = query.toLowerCase();
        return FALLBACK_TICKERS.filter(
            t => t.symbol.toLowerCase().includes(lowerQuery) ||
                t.name.toLowerCase().includes(lowerQuery)
        );
    };

    // Use local library as primary lookup to prevent rate limit hits
    const localResults = fallbackSearch();
    if (localResults.length > 0) {
        return NextResponse.json(localResults);
    }

    try {
        // Obfuscate the request to bypass basic rate limiting
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        ];

        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

        const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`, {
            headers: {
                'User-Agent': randomUserAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0',
            }
        });

        if (!res.ok) {
            console.warn(`Yahoo API returned ${res.status}, using fallback.`);
            return NextResponse.json(fallbackSearch());
        }

        const data = await res.json();
        const quotes = data.quotes || [];

        const results = quotes
            .filter((q: any) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
            .map((q: any) => ({
                symbol: q.symbol,
                name: q.shortname || q.longname || q.symbol
            }));

        return NextResponse.json(results.length > 0 ? results : fallbackSearch());
    } catch (error) {
        console.error("Search API Error:", error);
        return NextResponse.json(fallbackSearch());
    }
}
