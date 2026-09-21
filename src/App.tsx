// Replace this placeholder with the Space's actual UI.
// Use `@bragi/sdk` for any cross-Space or host-app communication.
//
// SP-22 slice 14: this Space is localized-by-structure from day one — every user-visible string
// goes through `i18n.t()` against src/locales/en.ts's catalog (see src/i18n.ts), never a bare
// string literal. Add a locale by adding a src/locales/<tag>.ts file, not by branching here.
import { i18n } from './i18n';

export function App() {
  return (
    <main>
      <h1>{i18n.t('space_title')}</h1>
      <p>{i18n.t('space_tagline', { slug: 'com.bragi.space.lumen' })}</p>
    </main>
  );
}
