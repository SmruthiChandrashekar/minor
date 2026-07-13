/**
 * translationService.js
 *
 * Handles DYNAMIC content translation only (complaints, AI responses).
 * Static UI labels (buttons, headings, statuses) are handled by i18n (translations.js).
 *
 * Uses MyMemory API — free, no API key required.
 * Results are cached in-memory to avoid duplicate API calls.
 */

const LANG_CODES = {
  English: "en",
  Hindi: "hi",
  Kannada: "kn",
};

// In-memory cache: key = "text|targetLangCode"
const cache = new Map();

/**
 * Translate a single string to the target language.
 * Returns original text if target is English or translation fails.
 */
export async function translateText(text, targetLanguage) {
  if (!text || !text.trim()) return text;
  if (targetLanguage === "English") return text;

  const targetCode = LANG_CODES[targetLanguage];
  if (!targetCode) return text;

  const cacheKey = `${text}|${targetCode}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetCode}`;
    const response = await fetch(url);
    const data = await response.json();

    const translated =
      data?.responseStatus === 200
        ? data.responseData.translatedText
        : text;

    cache.set(cacheKey, translated);
    return translated;
  } catch {
    return text; // graceful fallback on network error
  }
}

/**
 * Translate selected fields of an object.
 * Only fields listed in `fields` are translated; all others pass through unchanged.
 *
 * ✅ Translate: description, response, notes (user-generated)
 * ❌ Do NOT translate: category (HR/POSH), status (Open/Closed), IDs, timestamps
 */
export async function translateFields(obj, fields, targetLanguage) {
  if (targetLanguage === "English") return obj;

  const translated = { ...obj };
  await Promise.all(
    fields.map(async (field) => {
      if (obj[field]) {
        translated[field] = await translateText(obj[field], targetLanguage);
      }
    })
  );
  return translated;
}

/**
 * Translate an array of objects, only translating the specified fields.
 */
export async function translateList(items, fields, targetLanguage) {
  if (targetLanguage === "English") return items;
  return Promise.all(items.map((item) => translateFields(item, fields, targetLanguage)));
}
