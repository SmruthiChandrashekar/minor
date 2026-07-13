"""
translator.py

Backend translation utility using deep-translator (GoogleTranslator).

Rules:
    - ONLY translate dynamic/user-generated content (complaints, AI responses).
    - NEVER translate: category labels (HR, POSH), statuses (Open, Closed), IDs, timestamps.
    - Falls back to original text on any error or suspicious response.
"""

from deep_translator import GoogleTranslator
import time

# Supported language codes (ISO 639-1)
SUPPORTED_LANGS = {"en", "hi", "kn"}

# Strings that indicate the translation API returned an error page instead of a translation
_ERROR_MARKERS = [
    "server error", "that's an error", "please try again",
    "error 5", "error 4", "http error", "timeout",
    "that's all we know", "502", "503", "504", "429",
]

def _looks_like_error(text: str) -> bool:
    """Detect if the 'translation' is actually an HTTP error page string."""
    lowered = text.lower()
    return any(marker in lowered for marker in _ERROR_MARKERS)


def translate_text(text: str, target_lang: str, retries: int = 2) -> str:
    """
    Translate `text` to `target_lang`.
    - Returns original text if target is English or translation fails.
    - Retries once on failure with a short delay.
    - Falls back to English if the result looks like an error page.
    """
    if not text or not text.strip():
        return text
    if target_lang not in SUPPORTED_LANGS or target_lang == "en":
        return text

    # Split long texts to avoid API limits (Google caps at ~5000 chars)
    if len(text) > 4500:
        text = text[:4500]

    for attempt in range(retries + 1):
        try:
            result = GoogleTranslator(source="auto", target=target_lang).translate(text)
            if result and not _looks_like_error(result):
                return result
            # result was an error string — fall through to retry
            print(f"[Translator] Suspicious result on attempt {attempt + 1}: {result[:80]}")
        except Exception as e:
            print(f"[Translator] Warning (attempt {attempt + 1}): {e}")

        if attempt < retries:
            time.sleep(1.5)  # brief wait before retry

    print("[Translator] All attempts failed — returning original English text.")
    return text  # graceful fallback to English


def translate_to_english(text: str) -> str:
    """
    Normalize any user input to English for ML processing.
    """
    if not text or not text.strip():
        return text
    try:
        result = GoogleTranslator(source="auto", target="en").translate(text)
        if result and not _looks_like_error(result):
            return result
        return text
    except Exception as e:
        print(f"[Translator] Warning: normalization failed — {e}")
        return text
