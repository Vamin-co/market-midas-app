"""
The Trader (Execution-Agent).

Uses Playwright to automate the Robinhood web interface for order staging.

CONSTRAINT: Must operate strictly under "Human-in-the-Loop" protocols.
The agent must PAUSE and request human approval before any order submission.
The final "Submit" / "Review Order" button is NEVER clicked programmatically.

Browser: Chromium via Playwright (headed mode for human visibility).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

from src.portfolio.store import append_trade, close_ticker_position, get_position, normalize_mode

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SCREENSHOTS_DIR = PROJECT_ROOT / "logs" / "screenshots"
PAPER_TRADES_LOG = PROJECT_ROOT / "logs" / "paper_trades.json"
ROBINHOOD_BASE = "https://robinhood.com"

# ─── Safety constants ───────────────────────────────────────────────
# These selectors are NEVER to be clicked by automation.
FORBIDDEN_BUTTONS = [
    "text=Submit",
    "text=Review Order",
    "text=Place Order",
    "text=Confirm",
]


class TraderAgent:
    """Execution agent for Robinhood order staging via Playwright.

    Workflow:
      1. Launch Chromium in headed mode (user can see everything).
      2. Navigate to robinhood.com/login.
      3. PAUSE — wait for human to enter credentials + 2FA.
      4. Navigate to stock detail page.
      5. Scrape current price to verify correct page.
      6. Fill order form (action + quantity), NEVER submit.
      7. Capture screenshot for human review.

    This agent NEVER executes a trade without explicit human confirmation.
    """

    def __init__(self, mode: str = "paper") -> None:
        self._playwright = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self.is_authenticated = False
        self.mode = normalize_mode(mode)
        SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        PAPER_TRADES_LOG.parent.mkdir(parents=True, exist_ok=True)
        mode_label = "📝 PAPER" if self.mode == "paper" else "🔴 LIVE"
        logger.info(
            "TraderAgent initialized (%s mode, human-in-the-loop enforced).",
            mode_label,
        )

    # ─── Browser Lifecycle ───────────────────────────────────────────

    def launch_browser(self) -> Page:
        """Launch a headed Chromium browser.

        Returns:
            The active Playwright Page object.
        """
        if self._page and not self._page.is_closed():
            return self._page

        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(
            headless=False,  # User must be able to see the browser
            slow_mo=300,     # Slow down actions for visibility
        )
        self._context = self._browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        self._page = self._context.new_page()
        logger.info("Browser launched (headed mode, slow_mo=300ms).")
        return self._page

    def close_browser(self) -> None:
        """Safely close browser and clean up resources."""
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()
        self._page = None
        self._context = None
        self._browser = None
        self._playwright = None
        self.is_authenticated = False
        logger.info("Browser closed.")

    # ─── Login Flow ──────────────────────────────────────────────────

    def login_and_navigate(self, ticker: str) -> dict[str, Any]:
        """Navigate to Robinhood, wait for human login, then go to stock page.

        This method:
          1. Opens robinhood.com/login
          2. PAUSES — prints a message and waits for the user to complete
             login + 2FA manually
          3. Navigates to the stock detail page
          4. Scrapes the current price from the DOM

        Args:
            ticker: Stock ticker symbol (e.g., 'SPY', 'NVDA').

        Returns:
            dict with:
                - authenticated: bool
                - ticker: str
                - current_price: str | None
                - page_url: str
                - screenshot_path: str
        """
        page = self.launch_browser()

        # Step 1: Navigate to login page
        logger.info("Navigating to Robinhood login page...")
        page.goto(f"{ROBINHOOD_BASE}/login", wait_until="domcontentloaded")
        page.wait_for_timeout(2000)

        # Step 2: PAUSE — wait for human to log in
        logger.info("%s", "=" * 60)
        logger.info("  🔐 HUMAN ACTION REQUIRED")
        logger.info("  %s", "-" * 56)
        logger.info("  Please log in to Robinhood in the browser window.")
        logger.info("  Complete 2FA if prompted.")
        input("  Press ENTER here when you are fully logged in...\n")  # Block until human confirms login
        self.is_authenticated = True
        logger.info("User confirmed authentication.")

        # Step 3: Navigate to stock detail page
        stock_url = f"{ROBINHOOD_BASE}/stocks/{ticker.upper()}"
        logger.info("Navigating to %s", stock_url)
        page.goto(stock_url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)  # Allow dynamic content to load

        # Step 4: Scrape current price
        current_price = self._scrape_price(page, ticker)

        # Take a screenshot for the record
        screenshot_path = self._take_screenshot(page, f"{ticker}_stock_page")

        return {
            "authenticated": self.is_authenticated,
            "ticker": ticker.upper(),
            "current_price": current_price,
            "page_url": page.url,
            "screenshot_path": screenshot_path,
        }

    # ─── Order Staging (Safety Air Gap) ──────────────────────────────

    def stage_order(
        self,
        action: str,
        ticker: str,
        quantity: int | None = None,
        dollar_amount: float | None = None,
        price: float | None = None,
    ) -> dict[str, Any]:
        """Fill the Robinhood order form WITHOUT submitting.

        ⚠️  SAFETY: This method NEVER clicks Submit / Review Order / Place Order.
        It only fills the form fields and captures a screenshot.

        In paper mode, skips the browser entirely and logs
        the trade to logs/paper_trades.json.

        Args:
            action: 'BUY' or 'SELL'.
            ticker: Stock ticker symbol.
            quantity: Number of shares (mutually exclusive with dollar_amount).
            dollar_amount: Dollar amount to invest (mutually exclusive with quantity).
            price: Current price (used in paper mode for logging).

        Returns:
            dict with:
                - status: 'staged' | 'paper_traded' | 'error'
                - requires_approval: True (always in live mode)
                - order_details: dict with action, ticker, quantity/amount
                - screenshot_path: str path to screenshot (or None in paper mode)
                - message: str
        """
        # ─── PAPER TRADING MODE ──────────────────────────────────────
        if self.mode == "paper":
            return self._paper_trade(action, ticker, quantity, dollar_amount, price)
        if not self._page or self._page.is_closed():
            return {
                "status": "error",
                "requires_approval": True,
                "order_details": {},
                "screenshot_path": None,
                "message": "Browser not open. Call login_and_navigate() first.",
            }

        page = self._page
        logger.info(
            "⚠️  STAGING %s order for %s (WILL NOT SUBMIT)",
            action.upper(), ticker.upper(),
        )

        try:
            # Navigate to stock page if not already there
            stock_url = f"{ROBINHOOD_BASE}/stocks/{ticker.upper()}"
            if ticker.upper() not in page.url.upper():
                page.goto(stock_url, wait_until="domcontentloaded")
                page.wait_for_timeout(3000)

            # Try to click the Buy or Sell button to open the order panel
            if action.upper() == "BUY":
                buy_btn = page.locator(
                    "button:has-text('Buy'), "
                    "[data-testid='OrderFormHeading-Buy'], "
                    "span:has-text('Buy'):visible"
                ).first
                if buy_btn.is_visible():
                    buy_btn.click()
                    page.wait_for_timeout(1000)
            elif action.upper() == "SELL":
                sell_btn = page.locator(
                    "button:has-text('Sell'), "
                    "[data-testid='OrderFormHeading-Sell'], "
                    "span:has-text('Sell'):visible"
                ).first
                if sell_btn.is_visible():
                    sell_btn.click()
                    page.wait_for_timeout(1000)

            # Fill quantity or dollar amount
            amount_input = page.locator(
                "input[type='text'], "
                "input[type='number'], "
                "[data-testid='OrderFormRow-Shares'] input, "
                "[data-testid='OrderFormRow-Amount'] input"
            ).first

            fill_value = ""
            if quantity is not None:
                fill_value = str(quantity)
            elif dollar_amount is not None:
                fill_value = f"{dollar_amount:.2f}"

            if amount_input.is_visible() and fill_value:
                amount_input.click()
                amount_input.fill(fill_value)
                page.wait_for_timeout(500)
                logger.info("Filled order form: %s %s, value=%s",
                            action.upper(), ticker.upper(), fill_value)

            # ─── SAFETY AIR GAP ─────────────────────────────────────
            # Explicitly verify we do NOT click any forbidden buttons
            for forbidden in FORBIDDEN_BUTTONS:
                btn = page.locator(forbidden)
                if btn.count() > 0:
                    logger.warning(
                        "🛑 FORBIDDEN BUTTON DETECTED: '%s' — NOT clicking.",
                        forbidden,
                    )
            # ─── END SAFETY AIR GAP ─────────────────────────────────

            # Capture screenshot of the filled form
            screenshot_path = self._take_screenshot(page, f"{ticker}_staged_{action.lower()}")

            order_details = {
                "action": action.upper(),
                "ticker": ticker.upper(),
                "quantity": quantity,
                "dollar_amount": dollar_amount,
            }

            # ─── KILL SWITCH ─────────────────────────────────────────
            # The bot STOPS here. It has filled the form but NOT
            # clicked Submit. The human must review and decide.
            logger.info("%s", "=" * 60)
            logger.info("LIVE TRADE STAGED")
            logger.info("Action: %s", action.upper())
            logger.info("Ticker: %s", ticker.upper())
            logger.info("Quantity: %s", quantity or "N/A")
            logger.info("Amount: $%s", dollar_amount or "N/A")
            logger.info("Screenshot: %s", screenshot_path)
            logger.info("THE SUBMIT BUTTON HAS NOT BEEN CLICKED.")
            logger.info("Review the order form in the browser window.")

            try:
                input(
                    "LIVE TRADE STAGED. Press ENTER to confirm staging or CTRL+C to cancel.\n"
                )  # ← BLOCKS until human presses ENTER
                logger.info("Human confirmed staged order for %s.", ticker)
            except KeyboardInterrupt:
                logger.warning("🛑 TRADE CANCELLED by human (CTRL+C).")
                return {
                    "status": "cancelled",
                    "requires_approval": True,
                    "order_details": order_details,
                    "screenshot_path": screenshot_path,
                    "message": "Trade CANCELLED by human via CTRL+C.",
                }

            return {
                "status": "staged",
                "requires_approval": True,
                "order_details": order_details,
                "screenshot_path": screenshot_path,
                "message": "Order form filled and human-reviewed. Submit MANUALLY in browser.",
            }

        except Exception as e:
            logger.error("Error staging order: %s", e)
            screenshot_path = self._take_screenshot(page, f"{ticker}_error")
            return {
                "status": "error",
                "requires_approval": True,
                "order_details": {"action": action, "ticker": ticker},
                "screenshot_path": screenshot_path,
                "message": f"Error staging order: {e}",
            }

    # ─── Balance Verification ────────────────────────────────────────

    def verify_balance(self) -> dict[str, Any]:
        """Read current account balance from the Robinhood dashboard.

        Returns:
            dict with balance, buying_power, and screenshot_path.
        """
        if not self._page or self._page.is_closed():
            return {"balance": 0.0, "buying_power": 0.0, "screenshot_path": None}

        page = self._page
        logger.info("Navigating to account page to verify balance...")

        page.goto(f"{ROBINHOOD_BASE}/account", wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        # Try to scrape balance from the account page
        balance_text = None
        selectors = [
            "[data-testid='PortfolioValue']",
            "h1:has-text('$')",
            ".portfolio-value",
            "span:has-text('$'):visible",
        ]
        for sel in selectors:
            el = page.locator(sel).first
            if el.is_visible():
                balance_text = el.text_content()
                break

        balance = self._parse_currency(balance_text) if balance_text else 0.0
        screenshot_path = self._take_screenshot(page, "account_balance")

        logger.info("Account balance: $%.2f", balance)
        return {
            "balance": balance,
            "buying_power": 0.0,  # Would need separate scraping
            "screenshot_path": screenshot_path,
        }

    # ─── Price Scraping ──────────────────────────────────────────────

    def get_current_price(self, ticker: str) -> str | None:
        """Navigate to a stock page and return the current price.

        This is a convenience method for quick price checks without
        the full login_and_navigate flow (assumes already authenticated).

        Args:
            ticker: Stock ticker symbol.

        Returns:
            Current price as a string, or None if not found.
        """
        if not self._page or self._page.is_closed():
            logger.error("Browser not open. Call launch_browser() first.")
            return None

        page = self._page
        stock_url = f"{ROBINHOOD_BASE}/stocks/{ticker.upper()}"
        page.goto(stock_url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        return self._scrape_price(page, ticker)

    # ─── Paper Trading ─────────────────────────────────────────────────

    def _paper_trade(
        self,
        action: str,
        ticker: str,
        quantity: int | None,
        dollar_amount: float | None,
        price: float | None,
    ) -> dict[str, Any]:
        """Simulate a trade by logging to JSON instead of using the browser.

        Appends a record to logs/paper_trades.json and prints a bold alert.
        """
        ts = datetime.now(timezone.utc)
        cost = round(quantity * price, 2) if quantity and price else dollar_amount or 0.0

        if action.upper() == "BUY":
            record = append_trade(
                action="BUY",
                ticker=ticker.upper(),
                quantity=quantity or 0,
                price=price or 0.0,
                mode=self.mode,
                status="open",
                timestamp=ts.isoformat(),
            )
        else:
            position = get_position(ticker.upper(), self.mode)
            if position is None:
                return {
                    "status": "error",
                    "requires_approval": False,
                    "order_details": {},
                    "screenshot_path": None,
                    "message": f"No open position for {ticker.upper()}",
                }
            close_ticker_position(
                ticker.upper(),
                exit_price=price or 0.0,
                mode=self.mode,
            )
            record = {
                "timestamp": ts.isoformat(),
                "action": "SELL",
                "ticker": ticker.upper(),
                "quantity": position["shares"],
                "price": round(price or 0.0, 2),
                "dollar_amount": cost,
                "mode": self.mode,
            }

        logger.info("%s", "=" * 60)
        logger.info("PAPER TRADE SIMULATED")
        logger.info(
            "%s %s: %s shares @ $%.2f ($%s total)",
            action.upper(),
            ticker.upper(),
            quantity,
            price or 0.0,
            f"{cost:,.2f}",
        )
        logger.info("Logged to: %s", PAPER_TRADES_LOG)
        logger.info("Timestamp: %s", ts.strftime("%Y-%m-%d %H:%M:%S UTC"))

        return {
            "status": "paper_traded",
            "requires_approval": False,
            "order_details": record,
            "screenshot_path": None,
            "message": f"Paper trade logged: {action.upper()} {quantity} x {ticker.upper()} @ ${price:.2f}",
        }

    # ─── Private Helpers ─────────────────────────────────────────────

    def _scrape_price(self, page: Page, ticker: str) -> str | None:
        """Attempt to scrape the current stock price from the page DOM.

        Tries multiple selectors since Robinhood's DOM may vary.

        Returns:
            Price string (e.g., '$142.50') or None.
        """
        price_selectors = [
            "[data-testid='CurrentPrice']",
            "h1:has-text('$')",
            ".price-display",
            "header span:has-text('$')",
        ]

        for selector in price_selectors:
            try:
                el = page.locator(selector).first
                if el.is_visible(timeout=2000):
                    text = el.text_content()
                    if text and "$" in text:
                        price = text.strip()
                        logger.info("Price scraped for %s: %s", ticker, price)
                        return price
            except Exception:
                continue

        # Fallback: search page text for price-like patterns
        try:
            body_text = page.locator("body").text_content() or ""
            prices = re.findall(r"\$[\d,]+\.?\d*", body_text)
            if prices:
                price = prices[0]
                logger.info("Price found via regex for %s: %s", ticker, price)
                return price
        except Exception:
            pass

        logger.warning("Could not scrape price for %s", ticker)
        return None

    def _take_screenshot(self, page: Page, label: str) -> str:
        """Capture a timestamped screenshot.

        Args:
            page: Playwright Page object.
            label: Descriptive label for the filename.

        Returns:
            Absolute path to the saved screenshot.
        """
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{label}_{ts}.png"
        filepath = SCREENSHOTS_DIR / filename
        page.screenshot(path=str(filepath), full_page=False)
        logger.info("Screenshot saved: %s", filepath)
        return str(filepath)

    @staticmethod
    def _parse_currency(text: str) -> float:
        """Parse a currency string like '$12,345.67' into a float."""
        cleaned = re.sub(r"[^\d.]", "", text)
        try:
            return float(cleaned)
        except ValueError:
            return 0.0
