// SP-22 slice 14 — CATALOG CANON: every scaffolded Space ships this file. `en` is the MANDATORY
// fallback catalog — the one locale `../i18n.ts` never lazy-loads, so this Space always renders
// even if a later locale's thunk fails to load.
//
// Adding a locale: create a sibling `src/locales/<tag>.ts` (e.g. `de.ts`) exporting a `default`
// object with EXACTLY this file's key set (TypeScript enforces this: `../i18n.ts` types every
// registered catalog against this file's `Messages`), then register it in `../i18n.ts`'s
// `catalogs` map — see that file's header for the exact wiring.
const en = {
  space_title: 'Lumen',
  space_tagline: 'Bragi Space — {slug}',
} satisfies Record<string, string>;

/** This Space's own catalog shape — `createSpaceI18n<Messages>()` checks every `i18n.t(key)` call
 *  against these exact keys at compile time. Never widen this to `Record<string, string>`. */
export type Messages = typeof en;

export default en;
