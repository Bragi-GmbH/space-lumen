import { Component, type ErrorInfo, type ReactNode } from 'react';
import { emitSpaceJsError, emitSpaceRenderFailed } from "@bragi-gmbh/space-sdk";

/**
 * Root error boundary: catches render/commit errors below it and shows a
 * recoverable fallback instead of a blank screen (the WebView never
 * white-screens on a bundle bug — the host's watchdog is the backstop, not
 * the UX).
 *
 * G1a embedded telemetry: componentDidCatch reports the error identity as a
 * HASH only over the bridge (space_js_error kind 'error' + space_render_failed
 * with boot/post_boot phase) — never message text. Both helpers are fail-soft
 * and never throw, so the fallback path is unaffected; the console line stays
 * as the local dev/browser diagnostic.
 *
 * Inline styles on purpose — the scaffold template ships no styling system;
 * restyle the fallback with whatever this Space adopts (see the wla-home
 * Space — Bragi-GmbH/space-wla-home — for the Tailwind reference implementation).
 */

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    emitSpaceJsError(error, 'error');
    emitSpaceRenderFailed(error);
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            minHeight: '100dvh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '0 32px',
            textAlign: 'center',
            fontFamily: 'system-ui',
          }}
        >
          <p style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Something went wrong</p>
          <p style={{ maxWidth: 260, fontSize: 14, lineHeight: 1.4, margin: 0, opacity: 0.7 }}>
            The app hit an unexpected error. Try again — your device is unaffected.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              height: 44,
              borderRadius: 22,
              border: 'none',
              padding: '0 24px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
