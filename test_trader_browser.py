"""
Human-in-the-Loop Browser Test.

Opens a headed Chromium browser, navigates to the Robinhood SPY page,
and prints the current price to the terminal.

⚠️  NO TRADES ARE EXECUTED. This is a read-only test.

Usage:
    python test_trader_browser.py
    python test_trader_browser.py NVDA    # custom ticker
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from src.agents.trader import TraderAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)

TICKER = sys.argv[1] if len(sys.argv) > 1 else "SPY"


def main() -> None:
    trader = TraderAgent()

    print(f"\n{'='*60}")
    print(f"  🧪 TRADER AGENT — BROWSER TEST (READ-ONLY)")
    print(f"  Target: {TICKER}")
    print(f"  ⚠️  No trades will be executed.")
    print(f"{'='*60}\n")

    try:
        # Step 1: Login + navigate
        result = trader.login_and_navigate(TICKER)

        print(f"\n{'='*60}")
        print(f"  📊 RESULTS")
        print(f"  {'─'*56}")
        print(f"  Authenticated : {result['authenticated']}")
        print(f"  Ticker        : {result['ticker']}")
        print(f"  Current Price : {result['current_price']}")
        print(f"  Page URL      : {result['page_url']}")
        print(f"  Screenshot    : {result['screenshot_path']}")
        print(f"{'='*60}\n")

        # Keep browser open so user can inspect
        print("  Browser is still open for inspection.")
        print("  Press ENTER to close the browser and exit...")
        input()

    except KeyboardInterrupt:
        print("\n  Interrupted by user.")
    finally:
        trader.close_browser()
        print("  Browser closed. Test complete.")


if __name__ == "__main__":
    main()
