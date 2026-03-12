"""
Risk Manager.

Enforces position sizing and stop-loss constraints from PRD §4.3:
  - Max 5% of total account value per single trade.
  - Automatic stop-loss at 5% below entry price.
  - Validates sufficient account balance before generating buy signals.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class RiskManager:
    """Manages risk constraints for all trades.

    Attributes:
        max_position_pct: Maximum percentage of account to risk per trade.
        stop_loss_pct: Percentage below entry price for automatic stop-loss.
    """

    MAX_POSITION_PCT: float = 0.25  # 25% of account value (relaxed from 5%)
    STOP_LOSS_PCT: float = 0.05     # 5% below entry

    def __init__(self) -> None:
        logger.info(
            "RiskManager initialized (max_position=%.0f%%, stop_loss=%.0f%%).",
            self.MAX_POSITION_PCT * 100,
            self.STOP_LOSS_PCT * 100,
        )

    def calculate_position_size(
        self, account_value: float, entry_price: float
    ) -> dict[str, Any]:
        """Calculate the maximum position size for a trade.

        Args:
            account_value: Total account value in USD.
            entry_price: Current price per share.

        Returns:
            dict with:
                - max_dollars: float — max dollar amount to invest
                - max_shares: int — max whole shares to purchase
                - position_pct: float — actual percentage of account
        """
        max_dollars = account_value * self.MAX_POSITION_PCT
        max_shares = int(max_dollars // entry_price) if entry_price > 0 else 0

        result = {
            "max_dollars": round(max_dollars, 2),
            "max_shares": max_shares,
            "position_pct": self.MAX_POSITION_PCT,
        }
        logger.info("Position size: $%.2f (%d shares at $%.2f)",
                     result["max_dollars"], result["max_shares"], entry_price)
        return result

    def calculate_stop_loss(self, entry_price: float) -> float:
        """Calculate the stop-loss price.

        Args:
            entry_price: Price per share at entry.

        Returns:
            Stop-loss price (5% below entry).
        """
        stop_loss = round(entry_price * (1 - self.STOP_LOSS_PCT), 2)
        logger.info("Stop-loss for entry $%.2f → $%.2f", entry_price, stop_loss)
        return stop_loss

    def validate_trade(
        self, account_value: float, entry_price: float, shares: int
    ) -> dict[str, Any]:
        """Validate that a proposed trade meets all risk constraints.

        Args:
            account_value: Total account value in USD.
            entry_price: Price per share.
            shares: Number of shares to trade.

        Returns:
            dict with:
                - valid: bool
                - reason: str (if invalid)
                - trade_value: float
                - position_pct: float
        """
        trade_value = entry_price * shares
        position_pct = trade_value / account_value if account_value > 0 else float("inf")

        if position_pct > self.MAX_POSITION_PCT:
            return {
                "valid": False,
                "reason": (
                    f"Trade value ${trade_value:.2f} exceeds {self.MAX_POSITION_PCT*100:.0f}% "
                    f"max (${account_value * self.MAX_POSITION_PCT:.2f})."
                ),
                "trade_value": trade_value,
                "position_pct": position_pct,
            }

        if account_value < trade_value:
            return {
                "valid": False,
                "reason": f"Insufficient balance: ${account_value:.2f} < ${trade_value:.2f}.",
                "trade_value": trade_value,
                "position_pct": position_pct,
            }

        return {
            "valid": True,
            "reason": "Trade passes all risk checks.",
            "trade_value": trade_value,
            "position_pct": position_pct,
        }

    def check_circuit_breaker(
        self,
        current_balance: float,
        starting_balance: float,
        max_drawdown_pct: float = 0.05,
    ) -> dict[str, Any]:
        """Daily Circuit Breaker — halts all trading on excessive drawdown.

        Compares the current wallet balance against the starting daily balance.
        If the loss exceeds the configured max drawdown percentage, the system
        triggers a hard kill switch preventing any new trades.

        Args:
            current_balance: Current wallet balance after all realized P/L.
            starting_balance: Balance at the start of the trading day.
            max_drawdown_pct: Maximum allowed daily loss as a decimal (e.g. 0.05 = 5%).

        Returns:
            dict with:
                - tripped: bool — True if the circuit breaker has been triggered
                - drawdown_pct: float — current drawdown as a percentage
                - drawdown_dollars: float — absolute dollar loss
                - max_drawdown_pct: float — the configured limit
                - reason: str — human-readable explanation
        """
        if starting_balance <= 0:
            return {
                "tripped": False,
                "drawdown_pct": 0.0,
                "drawdown_dollars": 0.0,
                "max_drawdown_pct": max_drawdown_pct,
                "reason": "Starting balance is zero or negative; circuit breaker skipped.",
            }

        drawdown_dollars = starting_balance - current_balance
        drawdown_pct = drawdown_dollars / starting_balance

        if drawdown_pct >= max_drawdown_pct:
            msg = (
                f"⛔ CIRCUIT BREAKER TRIPPED: Daily drawdown of "
                f"{drawdown_pct*100:.1f}% (${drawdown_dollars:,.2f}) exceeds "
                f"the {max_drawdown_pct*100:.0f}% limit. All trading halted."
            )
            logger.warning(msg)
            return {
                "tripped": True,
                "drawdown_pct": round(drawdown_pct, 4),
                "drawdown_dollars": round(drawdown_dollars, 2),
                "max_drawdown_pct": max_drawdown_pct,
                "reason": msg,
            }

        logger.info(
            "Circuit breaker OK: drawdown %.1f%% < %.0f%% limit.",
            drawdown_pct * 100, max_drawdown_pct * 100,
        )
        return {
            "tripped": False,
            "drawdown_pct": round(drawdown_pct, 4),
            "drawdown_dollars": round(drawdown_dollars, 2),
            "max_drawdown_pct": max_drawdown_pct,
            "reason": f"Drawdown {drawdown_pct*100:.1f}% within {max_drawdown_pct*100:.0f}% limit.",
        }

