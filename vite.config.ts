import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` is CDN-relative so the bundle works regardless of the Supabase
// Storage path it gets uploaded to. The release pipeline uploads dist/*
// to <BRAGI_CDN_BASE_URL>/spaces/<canonical_slug>/<version>/, and AppKit
// serves the tarball contents from there. With `base: './'` Vite emits
// path-relative asset references that resolve against whatever URL the
// host loaded index.html from.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // No sourcemaps in the released bundle — dist/* is uploaded to the public
    // CDN, so a .js.map would expose the full component source (sourcesContent)
    // to anyone who can fetch the bundle, and it breaks content-addressed dedup
    // (see wla-home's vite.config.ts). Re-enable locally when debugging; don't
    // publish with it on.
    sourcemap: false,
  },
});
