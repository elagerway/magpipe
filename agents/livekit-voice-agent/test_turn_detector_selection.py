"""Tests for turn_detector_selection.should_use_english_detector.

Pins the contract: English/None/unknown -> EnglishModel; multi/fr/es/de -> Multilingual.
If this drifts, English agents could silently regress to the slower multilingual
detector (or vice versa). Run: pytest test_turn_detector_selection.py
"""
from turn_detector_selection import should_use_english_detector, MULTILINGUAL_LANGUAGES


def test_english_languages_use_english_detector():
    for lang in ("en-US", "en", "en-GB", "EN"):
        assert should_use_english_detector(lang) is True, lang


def test_default_and_unknown_use_english_detector():
    # New agents default to en-US, but None/unknown must also default to English.
    for lang in (None, "", "xx", "klingon"):
        assert should_use_english_detector(lang) is True, lang


def test_multilingual_languages_use_multilingual_detector():
    for lang in MULTILINGUAL_LANGUAGES:  # multi, fr, es, de
        assert should_use_english_detector(lang) is False, lang


def test_multilingual_opt_in_is_explicit():
    # The ONLY way to get the multilingual detector for an English-ish setup is to
    # explicitly choose "multi".
    assert should_use_english_detector("multi") is False
    assert should_use_english_detector("en-US") is True


if __name__ == "__main__":
    # Runnable without pytest (pytest isn't installed in the agent venv):
    #   python test_turn_detector_selection.py
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"✓ {fn.__name__}")
    print(f"All {len(fns)} turn-detector-selection tests passed.")
