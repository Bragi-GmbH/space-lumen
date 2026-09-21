// SP-22 slice 14 — this Space's i18n runtime, built on @bragi-gmbh/space-sdk's generic
// createSpaceI18n() (SP-22 slice 12). This is the ONE file that registers a locale: adding a new
// one is exactly two edits —
//   1. create src/locales/<tag>.ts, default-exporting an object matching src/locales/en.ts's
//      `Messages` key set exactly (TypeScript enforces this at the `catalogs` call below).
//   2. add `<tag>: () => import('./locales/<tag>.js').then((m) => m.default)` to `catalogs`.
//
// `en` is registered eagerly (not lazily) — it is this Space's mandatory fallback and must always
// be available even if every other locale's thunk fails to load or hasn't loaded yet. Every OTHER
// locale is registered as a thunk (dynamic `import()`) so this Space's initial bundle ships only
// the fallback catalog, not every locale it supports.
import { createSpaceI18n, resolveHostLocale } from '@bragi-gmbh/space-sdk';
import en, { type Messages } from './locales/en.js';

export const i18n = createSpaceI18n<Messages>({
  catalogs: {
    en,
    // de: () => import('./locales/de.js').then((m) => m.default),
  },
  fallback: 'en',
});

export { resolveHostLocale };
