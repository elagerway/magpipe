"""Turn-detector model selection — pure and dependency-free so it's unit-testable.

English agents use the faster EnglishModel turn detector; only agents whose
language genuinely needs the multilingual model (multilingual auto-detect, or a
specific non-English language the English model can't handle) use MultilingualModel.

EnglishModel is therefore the default for English, unknown, and None language —
matching the 'en-US' default for newly-created agents (see src/lib/agent-language.js).
This is the single source of truth for the predicate; agent.py imports it.
"""

# Languages that require the multilingual turn detector (EnglishModel is English-only).
MULTILINGUAL_LANGUAGES = ("multi", "fr", "es", "de")


def should_use_english_detector(language) -> bool:
    """True if the English turn detector should be used for this agent language.

    English/None/unknown -> True (EnglishModel); multi/fr/es/de -> False (Multilingual).
    """
    return language not in MULTILINGUAL_LANGUAGES
