/**
 * Enterprise Production i18n Engine for Puravankara GRM Portal
 * 
 * Capabilities:
 * - Lazy-loaded JSON chunks from `/locales/{lng}/translation.json` over HTTP
 * - Multi-tier language detection: URL query (?lang=kn) -> localStorage -> navigator.language
 * - Dot-notation & direct key lookup with key fallback
 * - Interpolation support ({{count}} items)
 * - Reactive state subscribers for zero-downtime instantaneous UI re-rendering
 * - Enterprise fallback hierarchy: Selected Language -> English ('en') -> Raw Key
 */

import { defaultEnglishDictionary } from './context/translations';

const SUPPORTED_LANGUAGES = ['en', 'hi', 'kn'];
const DEFAULT_LANGUAGE = 'en';

class EnterpriseI18n {
  constructor() {
    this.language = this.detectLanguage();
    this.locales = {
      en: { ...defaultEnglishDictionary },
      hi: {},
      kn: {}
    };
    this.listeners = new Set();
    this.loading = false;
    this.loadedLanguages = new Set(['en']);

    // Pre-load active language chunk if not English
    if (this.language !== 'en') {
      this.loadLanguageChunk(this.language);
    }
  }

  detectLanguage() {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE;

    // 1. URL Query Parameter (?lang=kn or ?lang=hi)
    const urlParams = new URLSearchParams(window.location.search);
    const queryLang = urlParams.get('lang');
    if (queryLang && SUPPORTED_LANGUAGES.includes(queryLang.toLowerCase())) {
      return queryLang.toLowerCase();
    }

    // 2. LocalStorage cache
    const cached = localStorage.getItem('grm_language_code');
    if (cached && SUPPORTED_LANGUAGES.includes(cached)) {
      return cached;
    }
    const legacyName = localStorage.getItem('grm_language');
    if (legacyName === 'Kannada') return 'kn';
    if (legacyName === 'Hindi') return 'hi';
    if (legacyName === 'English') return 'en';

    // 3. Browser Navigator Language
    const browserLang = (navigator.language || '').substring(0, 2).toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(browserLang)) {
      return browserLang;
    }

    return DEFAULT_LANGUAGE;
  }

  async loadLanguageChunk(lng) {
    if (this.loadedLanguages.has(lng) && Object.keys(this.locales[lng] || {}).length > 0) {
      return this.locales[lng];
    }

    try {
      this.loading = true;
      const res = await fetch(`/locales/${lng}/translation.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.locales[lng] = { ...this.locales.en, ...data };
      this.loadedLanguages.add(lng);
    } catch (err) {
      console.warn(`[Enterprise-i18n] Failed to fetch chunk for '${lng}', using base fallback:`, err);
    } finally {
      this.loading = false;
      this.notify();
    }
    return this.locales[lng];
  }

  async changeLanguage(lng) {
    const target = (lng || 'en').toLowerCase().substring(0, 2);
    if (!SUPPORTED_LANGUAGES.includes(target)) return;

    this.language = target;
    if (typeof window !== 'undefined') {
      localStorage.setItem('grm_language_code', target);
      const nameMap = { en: 'English', hi: 'Hindi', kn: 'Kannada' };
      localStorage.setItem('grm_language', nameMap[target] || 'English');
    }

    if (!this.loadedLanguages.has(target)) {
      await this.loadLanguageChunk(target);
    } else {
      this.notify();
    }
  }

  t(key, params = {}) {
    if (!key) return '';
    const activeDict = this.locales[this.language] || {};
    const fallbackDict = this.locales.en || {};

    let value = activeDict[key] ?? fallbackDict[key] ?? key;

    if (typeof value === 'string' && params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
      }
    }
    return value;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((listener) => {
      try {
        listener(this.language);
      } catch (e) {
        console.error('[Enterprise-i18n] Listener error:', e);
      }
    });
  }
}

export const i18n = new EnterpriseI18n();

export default i18n;
