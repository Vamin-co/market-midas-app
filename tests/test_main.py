import pytest
from src import main as main_module


def test_run_daily_cycle_is_disabled():
    with pytest.raises(NotImplementedError) as exc_info:
        main_module.run_daily_cycle("NVDA")

    assert "/analyze" in str(exc_info.value)
    assert "/trade" in str(exc_info.value)
