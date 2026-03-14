"""
The Researcher (Sentinel-Agent).

Fetches recent news headlines for a given ticker via multiple sources
(Google News RSS, Yahoo Finance RSS) and classifies each headline as
bullish, bearish, or neutral using keyword-based sentiment analysis.

Produces a structured sentiment summary for the Debate agents:
  - bullish_headlines: list of (headline, source)
  - bearish_headlines: list of (headline, source)
  - neutral_headlines: list of (headline, source)
  - composite_score: float from -1.0 (max bearish) to +1.0 (max bullish)
"""

import logging
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote_plus

import requests

logger = logging.getLogger(__name__)

# ─── Keyword lexicons for rule-based sentiment ──────────────────────
BULLISH_KEYWORDS = [
    "beat", "beats", "record", "surge", "surges", "rally", "rallies",
    "upgrade", "upgraded", "outperform", "buy", "strong", "growth",
    "raises", "raise", "boost", "boosts", "positive", "profit",
    "gains", "gain", "bullish", "optimistic", "soars", "soar",
    "breakout", "all-time high", "revenue beat", "earnings beat",
    "exceeds", "exceeded", "upside", "momentum", "innovation",
    "partnership", "expansion", "launch", "launches", "deal",
    "ai", "artificial intelligence", "demand", "record revenue",
]

BEARISH_KEYWORDS = [
    "miss", "misses", "fall", "falls", "drop", "drops", "decline",
    "downgrade", "downgraded", "sell", "weak", "loss", "loses",
    "bearish", "pessimistic", "crash", "plunge", "plunges",
    "layoff", "layoffs", "cut", "cuts", "warning", "risk",
    "investigation", "lawsuit", "probe", "recall", "debt",
    "concern", "concerns", "slump", "tumble", "fear", "fears",
    "regulation", "ban", "tariff", "slowdown", "recession",
    "overvalued", "bubble", "fraud", "bankruptcy", "default",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}


@dataclass
class Headline:
    """Single news headline with metadata."""
    title: str
    source: str
    url: str
    sentiment: str  # "bullish", "bearish", "neutral"
    published: str = ""


@dataclass
class SentimentSummary:
    """Structured sentiment report for debate agents."""
    ticker: str
    bullish_headlines: list[Headline] = field(default_factory=list)
    bearish_headlines: list[Headline] = field(default_factory=list)
    neutral_headlines: list[Headline] = field(default_factory=list)
    composite_score: float = 0.0            # -1.0 to +1.0
    total_headlines: int = 0
    timestamp: str = ""


class ResearcherAgent:
    """Sentinel agent — fetches news and classifies sentiment.

    Multi-source news aggregation:
      1. Google News RSS (primary)
      2. Yahoo Finance RSS (secondary)

    Sentiment classification:
      - Keyword-based lexicon matching
      - Bullish/Bearish/Neutral bucketing
      - Composite score from -1.0 to +1.0
    """

    def __init__(self) -> None:
        self._session = requests.Session()
        self._session.headers.update(HEADERS)
        logger.info("ResearcherAgent (Sentinel) initialized.")

    def fetch_latest_news(self, ticker: str) -> list[Headline]:
        """Fetch recent news headlines from multiple sources.

        Args:
            ticker: Stock ticker symbol (e.g., 'NVDA').

        Returns:
            List of Headline objects with sentiment classification.
        """
        headlines: list[Headline] = []

        # Source 1: Google News RSS
        google_headlines = self._fetch_google_news(ticker)
        headlines.extend(google_headlines)

        # Source 2: Yahoo Finance RSS
        yahoo_headlines = self._fetch_yahoo_finance(ticker)
        headlines.extend(yahoo_headlines)

        # Deduplicate by title similarity
        seen_titles: set[str] = set()
        unique: list[Headline] = []
        for h in headlines:
            normalized = h.title.lower().strip()[:60]
            if normalized not in seen_titles:
                seen_titles.add(normalized)
                unique.append(h)
        headlines = unique

        # Classify sentiment
        for h in headlines:
            h.sentiment = self._classify_headline(h.title)

        logger.info(
            "Fetched %d headlines for %s (B:%d / N:%d / Bear:%d)",
            len(headlines), ticker,
            sum(1 for h in headlines if h.sentiment == "bullish"),
            sum(1 for h in headlines if h.sentiment == "neutral"),
            sum(1 for h in headlines if h.sentiment == "bearish"),
        )
        return headlines

    def summarize_sentiment(self, ticker: str) -> SentimentSummary:
        """Fetch news and produce a structured sentiment summary.

        Args:
            ticker: Stock ticker symbol.

        Returns:
            SentimentSummary with classified headlines and composite score.
        """
        headlines = self.fetch_latest_news(ticker)

        summary = SentimentSummary(
            ticker=ticker,
            bullish_headlines=[h for h in headlines if h.sentiment == "bullish"],
            bearish_headlines=[h for h in headlines if h.sentiment == "bearish"],
            neutral_headlines=[h for h in headlines if h.sentiment == "neutral"],
            total_headlines=len(headlines),
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

        # Composite score: +1 per bullish, -1 per bearish, 0 per neutral
        if headlines:
            raw = (len(summary.bullish_headlines) - len(summary.bearish_headlines))
            summary.composite_score = round(
                max(-1.0, min(1.0, raw / max(len(headlines), 1))), 2
            )

        logger.info(
            "Sentiment for %s: score=%.2f (%d bullish, %d bearish, %d neutral)",
            ticker, summary.composite_score,
            len(summary.bullish_headlines),
            len(summary.bearish_headlines),
            len(summary.neutral_headlines),
        )
        return summary

    # ─── News Sources ────────────────────────────────────────────────

    def _fetch_google_news(self, ticker: str) -> list[Headline]:
        """Fetch headlines from Google News RSS."""
        query = quote_plus(f"{ticker} stock")
        url = f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"
        return self._parse_rss(url, default_source="Google News")

    def _fetch_yahoo_finance(self, ticker: str) -> list[Headline]:
        """Fetch headlines from Yahoo Finance RSS."""
        url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
        return self._parse_rss(url, default_source="Yahoo Finance")

    def _parse_rss(self, url: str, default_source: str) -> list[Headline]:
        """Parse an RSS feed and extract headlines.

        Attempts to extract the real publisher name from each item:
          - Google News RSS: uses the ``<source>`` element text.
          - Yahoo Finance RSS: splits the title on ``": "`` to extract
            the publisher prefix (e.g. ``"Reuters: …"`` → ``"Reuters"``).

        Falls back to *default_source* when the publisher cannot be
        determined from the feed item.

        Args:
            url: RSS feed URL.
            default_source: Fallback source label (e.g. ``"Google News"``).

        Returns:
            List of Headline objects (sentiment not yet classified).
        """
        headlines: list[Headline] = []
        is_yahoo = "yahoo" in url.lower()

        try:
            resp = self._session.get(url, timeout=10)
            resp.raise_for_status()

            root = ET.fromstring(resp.content)
            # RSS 2.0 structure: <rss><channel><item>
            for item in root.iter("item"):
                title_el = item.find("title")
                link_el = item.find("link")
                pub_el = item.find("pubDate")
                source_el = item.find("source")

                if title_el is None or not title_el.text:
                    continue

                raw_title = title_el.text.strip()
                item_source = default_source

                if is_yahoo:
                    # Yahoo Finance titles often have "Publisher: Headline"
                    if ": " in raw_title:
                        prefix, remainder = raw_title.split(": ", 1)
                        # Only treat as publisher if the prefix is short
                        # (avoids splitting on colons within headlines)
                        if len(prefix) <= 40 and remainder:
                            item_source = prefix.strip()
                            raw_title = remainder.strip()
                elif source_el is not None and source_el.text:
                    # Google News RSS includes <source url="...">Publisher</source>
                    item_source = source_el.text.strip()

                headlines.append(Headline(
                    title=raw_title,
                    source=item_source,
                    url=link_el.text.strip() if link_el is not None and link_el.text else "",
                    sentiment="neutral",  # classified later
                    published=pub_el.text.strip() if pub_el is not None and pub_el.text else "",
                ))

            # Limit to 15 most recent per source
            headlines = headlines[:15]

        except requests.RequestException as e:
            logger.warning("Failed to fetch %s RSS: %s", default_source, e)
        except ET.ParseError as e:
            logger.warning("Failed to parse %s RSS XML: %s", default_source, e)

        return headlines

    # ─── Sentiment Classification ────────────────────────────────────

    @staticmethod
    def _classify_headline(title: str) -> str:
        """Classify a headline as bullish, bearish, or neutral.

        Uses keyword lexicon matching with case-insensitive search.
        If both bullish and bearish keywords match, the side with
        more matches wins. Ties → neutral.
        """
        lower = title.lower()

        bull_count = sum(1 for kw in BULLISH_KEYWORDS if kw in lower)
        bear_count = sum(1 for kw in BEARISH_KEYWORDS if kw in lower)

        if bull_count > bear_count:
            return "bullish"
        elif bear_count > bull_count:
            return "bearish"
        return "neutral"

    # ─── Legacy API ──────────────────────────────────────────────────

    def score_sentiment(self, ticker: str) -> dict[str, Any]:
        """Legacy interface — wraps summarize_sentiment for backward compat."""
        summary = self.summarize_sentiment(ticker)
        return {
            "score": summary.composite_score,
            "confidence": min(1.0, summary.total_headlines / 10),
            "headlines": [
                {"title": h.title, "sentiment": h.sentiment, "source": h.source}
                for h in (summary.bullish_headlines
                          + summary.bearish_headlines
                          + summary.neutral_headlines)
            ],
            "reasoning": (
                f"{ticker}: {len(summary.bullish_headlines)} bullish, "
                f"{len(summary.bearish_headlines)} bearish, "
                f"{len(summary.neutral_headlines)} neutral headlines. "
                f"Composite score: {summary.composite_score:+.2f}"
            ),
            "classification": (
                "bullish" if summary.composite_score > 0.2
                else "bearish" if summary.composite_score < -0.2
                else "neutral"
            ),
        }
