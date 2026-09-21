import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { initSpaceTelemetry, reportRenderHealth } from "@bragi-gmbh/space-sdk";
import { App } from './App';
import { ErrorBoundary } from './components/error-boundary';
import { i18n, resolveHostLocale } from './i18n';

// G1a embedded telemetry: one init per Space, at module eval (emits the
// bundle_ready boot mark, installs the global error/session handlers).
// Emission is bridge-only (window.bragi.reportTelemetry) and fail-soft — with
// no bridge present (dev browser, Portal preview) the bundle boots normally
// and envelopes queue in a bounded FIFO. The slug is this Space's canonical
// identity (U3): every envelope asserts exactly this, never a host/org claim.
initSpaceTelemetry({ spaceSlug: 'com.bragi.space.lumen' });

// Module-level flag survives React StrictMode remounts (a ref would reset).
let renderHealthReported = false;

// AppKit render-health contract: report bundle_render_ok only after a successful
// commit to the DOM — the effect never runs if App throws during mount. The call
// goes through the shared @bragi/sdk reportRenderHealth: same pinned event shape
// on the same window.bragi.reportRenderHealth channel, fail-soft when the bridge
// is absent — and the sdk derives the space_boot telemetry mark + session start
// from this first successful commit. The bundle publish gate (C1b/C1d) asserts
// bundle_render_ok + the embedded telemetry set fire within 3s under a mock bridge.
function RootWithHealth() {
  useEffect(() => {
    if (renderHealthReported) return;
    renderHealthReported = true;
    reportRenderHealth({ type: 'bundle_render_ok' });
  }, []);
  return <App />;
}

// SP-22 slice 14: negotiate + load this Space's locale BEFORE the first render, so `App` never
// renders once with the fallback catalog and then re-renders once the real one arrives — an async
// IIFE (not top-level `await`) keeps this compatible with every host WebView this bundle targets,
// not just ones that support top-level await in module entry points.
async function bootstrap() {
  await i18n.setLocale(resolveHostLocale());

  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('Mount point #root not found in index.html');
  }

  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <RootWithHealth />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
