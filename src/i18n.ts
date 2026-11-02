/**
 * SuperFun — tiny gettext-style i18n (no dependency).
 *
 * The English source string IS the key: `tr('Your turn')`. Other languages map
 * English → translation in their own dictionary; a missing entry falls back to
 * English, so an untranslated string never breaks the UI.
 * Placeholders: `tr('{name} wins!', {name})`.
 * __tests__/i18n.test.js checks every tr('…') literal has a French entry.
 */
import {I18nManager} from 'react-native';
import FR from './i18n.fr';

export type Lang = 'en' | 'fr';
export const LANGS: Lang[] = ['en', 'fr'];
const DICTS: {[l in Lang]?: {[en: string]: string}} = {fr: FR};

let current: Lang = 'en';

// Device locale (Android exposes it via I18nManager; Intl as a fallback).
export function deviceLang(): Lang {
  let loc = '';
  try { loc = (I18nManager as any).getConstants().localeIdentifier || ''; } catch (e) { /* not available */ }
  if (!loc) {
    try { loc = Intl.DateTimeFormat().resolvedOptions().locale || ''; } catch (e) { /* no Intl */ }
  }
  return /^fr/i.test(loc) ? 'fr' : 'en';
}

export function setLang(l: string | null | undefined): void {
  current = l === 'fr' || l === 'en' ? l : deviceLang();
}
export function getLang(): Lang { return current; }

export function tr(en: string, vars?: {[k: string]: string | number}): string {
  const d = DICTS[current];
  let out = (d && d[en]) || en;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}
