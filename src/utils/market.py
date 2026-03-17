"""
Market Status Utility.

Determines current NYSE market status using pandas_market_calendars
and Eastern Time zone logic. Used by the frontend to display
market state and by the execute pipeline for context.
"""

from datetime import datetime, timedelta

import pandas_market_calendars as mcal
import pytz

# Singleton NYSE calendar object — one per process, not per call
_nyse = mcal.get_calendar("NYSE")


def get_market_status() -> dict:
    """Return current NYSE market status with next event info.

    Returns:
        Dict with keys: status, label, next_event, is_trading_day.
    """
    eastern = pytz.timezone("America/New_York")
    now_et = datetime.now(eastern)
    today = now_et.date()

    # Fetch a 60-day forward schedule to find today and next trading day
    schedule = _nyse.schedule(
        start_date=today,
        end_date=today + timedelta(days=60),
    )

    is_trading_day = today in schedule.index.date

    if not is_trading_day:
        # Find next trading day from the schedule
        future_days = schedule[schedule.index.date > today]
        if not future_days.empty:
            next_day = future_days.index[0]
            day_name = next_day.strftime("%A")
            next_event = f"Opens {day_name} 9:30 AM ET"
        else:
            next_event = "Opens next trading day 9:30 AM ET"

        return {
            "status": "closed",
            "label": "CLOSED",
            "next_event": next_event,
            "is_trading_day": False,
        }

    # It IS a trading day — determine session based on current ET time
    hour = now_et.hour
    minute = now_et.minute

    if hour < 4:
        return {
            "status": "closed",
            "label": "CLOSED",
            "next_event": "Pre-market opens at 4:00 AM ET",
            "is_trading_day": True,
        }

    if hour < 9 or (hour == 9 and minute < 30):
        # Pre-market: 4:00 AM – 9:29 AM
        market_open = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
        delta = market_open - now_et
        hours, remainder = divmod(int(delta.total_seconds()), 3600)
        mins = remainder // 60
        return {
            "status": "pre_market",
            "label": "PRE-MARKET",
            "next_event": f"Market opens in {hours}h {mins}m",
            "is_trading_day": True,
        }

    if hour < 16:
        # Regular session: 9:30 AM – 3:59 PM
        market_close = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
        delta = market_close - now_et
        hours, remainder = divmod(int(delta.total_seconds()), 3600)
        mins = remainder // 60
        return {
            "status": "open",
            "label": "OPEN",
            "next_event": f"Market closes in {hours}h {mins}m",
            "is_trading_day": True,
        }

    if hour < 20:
        # Post-market: 4:00 PM – 7:59 PM
        post_close = now_et.replace(hour=20, minute=0, second=0, microsecond=0)
        delta = post_close - now_et
        hours, remainder = divmod(int(delta.total_seconds()), 3600)
        mins = remainder // 60
        return {
            "status": "post_market",
            "label": "POST-MARKET",
            "next_event": f"Post-market closes in {hours}h {mins}m",
            "is_trading_day": True,
        }

    # 8:00 PM and after
    return {
        "status": "closed",
        "label": "CLOSED",
        "next_event": "Pre-market opens at 4:00 AM ET",
        "is_trading_day": True,
    }


if __name__ == "__main__":
    import pytz
    from datetime import datetime

    eastern = pytz.timezone("America/New_York")
    now_et = datetime.now(eastern)
    print(f"Current ET time: {now_et.strftime('%A %Y-%m-%d %H:%M')}")
    result = get_market_status()
    print(f"Status: {result['status']}")
    print(f"Label: {result['label']}")
    print(f"Next event: {result['next_event']}")
    print(f"Is trading day: {result['is_trading_day']}")
