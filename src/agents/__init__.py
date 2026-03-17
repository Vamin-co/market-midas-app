"""
Market-Midas Agent Team Coordinator.

Orchestrates the three sub-agents (Analyst, Researcher, Trader)
and merges their outputs into a unified trade signal.
"""

import logging
from typing import Any

from src.agents.analyst import AnalystAgent
from src.agents.researcher import ResearcherAgent
from src.agents.trader import TraderAgent

logger = logging.getLogger(__name__)


class AgentTeam:
    """Coordinates the Analyst, Researcher, and Trader agents.

    The Team Lead spawns each agent in sequence:
      1. Analyst  → technical indicators
      2. Researcher → sentiment score
      3. Strategy Engine merges signals → trade decision
      4. Trader → stages the order (human-in-the-loop)
    """

    def __init__(self) -> None:
        self.analyst = AnalystAgent()
        self.researcher = ResearcherAgent()
        self.trader = TraderAgent(mode="paper")
        logger.info("AgentTeam initialized with all three sub-agents.")

    def run_pipeline(self, ticker: str) -> dict[str, Any]:
        """Execute the full analysis-to-execution pipeline for a ticker.

        Args:
            ticker: Stock ticker symbol (e.g., 'NVDA').

        Returns:
            dict containing the final trade signal with keys:
                ticker, action, confidence_score, reasoning,
                timestamp, stop_loss, position_size_pct.
        """
        logger.info("Starting pipeline for %s", ticker)

        # Phase 1: Technical Analysis
        technical_data = self.analyst.analyze(ticker)
        logger.info("Analyst complete for %s", ticker)

        # Phase 2: Sentiment Analysis
        sentiment_data = self.researcher.score_sentiment(ticker)
        logger.info("Researcher complete for %s", ticker)

        # Phase 3: Strategy Engine merges signals (TODO: Phase 2 implementation)
        signal: dict[str, Any] = {
            "ticker": ticker,
            "action": "HOLD",
            "confidence_score": 0.0,
            "reasoning": "Pipeline scaffold — strategy engine not yet implemented.",
            "technical": technical_data,
            "sentiment": sentiment_data,
        }

        # Phase 4: Execution (human-in-the-loop)
        # execution_result = self.trader.stage_order(signal)

        logger.info("Pipeline complete for %s: %s", ticker, signal["action"])
        return signal
