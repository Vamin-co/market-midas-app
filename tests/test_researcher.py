from src.agents.researcher import ResearcherAgent


def test_ai_keyword_does_not_match_inside_other_words():
    headline = "Chairman said outlook remains unchanged"
    assert ResearcherAgent._classify_headline(headline) == "neutral"


def test_ai_keyword_still_matches_as_standalone_token():
    headline = "Company launches new AI platform"
    assert ResearcherAgent._classify_headline(headline) == "bullish"
