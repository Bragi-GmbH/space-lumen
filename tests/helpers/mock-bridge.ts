/**
 * Shared mock-bridge helper for the publish-gate test. Mirrors EVERY surface
 * the native host injects for a Space — not just telemetry:
 *
 *  1. `window.bragi` — hostConfig (brand / device_class / locale), networkState
 *     + onNetworkStateChange, reportRenderHealth (pinned appkit render-health
 *     channel), reportTelemetry (the envelope channel emitSpaceTelemetry and
 *     the SDK lifecycle emits write to).
 *  2. The NATIVE outbound `window.AndroidApp.notifyApp(category, type, bytes)`
 *     the SDK's hostBridge / isHostBridgeAvailable() detect. Without it the
 *     Space believes it runs in a plain browser, never creates its client and
 *     never sends a single device / agent / preference / notification command
 *     — which is exactly what the previous version of this helper did, so the
 *     old test proved telemetry only. Every capability invoke is decoded and
 *     recorded in `__capabilityCalls`.
 *  3. The typed postMessage client (`createBragiClient()` → `window.parent
 *     .postMessage({ type: 'bragi:…', payload })`). At top level `parent ===
 *     window`, so a `message` listener on the page records every command in
 *     `__clientCommands` in send order.
 *  4. INBOUND: the SDK installs `window.AudioAppKit.notify(category, type,
 *     bytes)` for native → Space traffic. `pushHearingState` (type 1, live
 *     hearing state from the device) and `refuseCapability` (type 2,
 *     NOT_GRANTED / CAPABILITY_UNKNOWN — Option C: native is the sole grant
 *     authority) drive it from the test.
 *
 * Injection happens via addInitScript, i.e. BEFORE document load.
 */
import type { Page } from '@playwright/test'

/** Telemetry-shaped egress patterns — mirrors the packet's own
 * no-telemetry-network static scan (TELEMETRY_SINK_PATTERNS in
 * .bragi/managed/space-ci/checks/integration-check.mjs). Runtime-layer
 * check: assert zero attempted request matches these while telemetry
 * emission demonstrably happened over the bridge instead. */
export const TELEMETRY_ENDPOINT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\/v1\/host-telemetry/i, label: '/v1/host-telemetry' },
  { pattern: /\/v1\/events/i, label: '/v1/events' },
  { pattern: /posthog/i, label: 'posthog' },
  { pattern: /sentry\.io/i, label: 'sentry.io' },
  { pattern: /\bingest\./i, label: 'ingest.' },
]

export function telemetryShapedUrls(urls: string[]): string[] {
  return urls.filter((u) => TELEMETRY_ENDPOINT_PATTERNS.some(({ pattern }) => pattern.test(u)))
}

/** Block every request outside the bundle prefix and record each blocked
 * URL — proves emission happened while zero telemetry-shaped egress was
 * even attempted. */
export async function blockAndRecordNonBundleRequests(
  page: Page,
  bundlePrefix: string,
): Promise<string[]> {
  const attempted: string[] = []
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith(bundlePrefix)) return route.continue()
    attempted.push(url)
    return route.abort()
  })
  return attempted
}

/** The host-config the mock injects — the resolved HCM subset the Android host projects. */
export const MOCK_HOST_CONFIG = {
  brand: 'halo',
  device_class: 'halo-aura-one',
  locale: 'en-GB',
  host_app: 'com.bragi.host.mock',
} as const

/** One recorded typed-client command (`window.parent.postMessage`). */
export interface ClientCommand {
  type: string
  payload: Record<string, unknown>
}

/** One recorded native capability invoke (`AndroidApp.notifyApp('capability', …)`). */
export interface CapabilityCall {
  category: string
  type: string
  message: { capability?: string; method?: string; params?: Record<string, unknown> } | null
}

/** Install the complete mock host: `window.bragi`, the native outbound, the
 * postMessage recorder. Pre-load. */
export async function installMockBridge(
  page: Page,
  options: { hostConfig?: Record<string, unknown>; networkState?: 'online' | 'offline' | 'degraded' } = {},
): Promise<void> {
  await page.addInitScript(
    ({ hostConfig, networkState }) => {
      const healthCalls: unknown[] = []
      const telemetryCalls: unknown[] = []
      const capabilityCalls: unknown[] = []
      const clientCommands: unknown[] = []
      const w = window as Window & {
        bragi?: unknown
        AndroidApp?: unknown
        AudioAppKit?: { notify?: (c: string, t: number, p?: Uint8Array) => void }
        __healthCalls?: unknown[]
        __telemetryCalls?: unknown[]
        __capabilityCalls?: unknown[]
        __clientCommands?: unknown[]
      }
      // 1. window.bragi — the Space-facing bridge object.
      w.bragi = {
        hostConfig,
        networkState,
        onNetworkStateChange: null,
        reportRenderHealth: (event: unknown) => { healthCalls.push(event) },
        reportTelemetry: (envelope: unknown) => { telemetryCalls.push(envelope) },
        capability: { invoke: () => {} },
      }
      // 2. native outbound — makes isHostBridgeAvailable() true and records
      //    every hostBridge invoke (decoded).
      w.AndroidApp = {
        notifyApp: (category: string, type: string, payload: Uint8Array) => {
          let message: unknown = null
          try { message = JSON.parse(new TextDecoder().decode(payload)) } catch { message = null }
          capabilityCalls.push({ category, type, message })
        },
      }
      // 4. inbound sink the SDK wraps (ensureInbound keeps the prior handler).
      if (!w.AudioAppKit) w.AudioAppKit = {}
      // 3. typed-client recorder: parent === window at top level.
      window.addEventListener('message', (e: MessageEvent) => {
        const d = e.data as { type?: unknown; payload?: unknown } | null
        if (d && typeof d.type === 'string' && d.type.startsWith('bragi:')) {
          clientCommands.push({ type: d.type, payload: (d.payload ?? {}) as Record<string, unknown> })
        }
      })
      w.__healthCalls = healthCalls
      w.__telemetryCalls = telemetryCalls
      w.__capabilityCalls = capabilityCalls
      w.__clientCommands = clientCommands
    },
    { hostConfig: options.hostConfig ?? MOCK_HOST_CONFIG, networkState: options.networkState ?? 'online' },
  )
}

/** Every typed-client command recorded so far, in send order. */
export async function clientCommands(page: Page): Promise<ClientCommand[]> {
  return page.evaluate(() => (window as unknown as { __clientCommands: ClientCommand[] }).__clientCommands)
}

/** Every native capability invoke recorded so far. */
export async function capabilityCalls(page: Page): Promise<CapabilityCall[]> {
  return page.evaluate(() => (window as unknown as { __capabilityCalls: CapabilityCall[] }).__capabilityCalls)
}

/** Native → Space: the device reports a live hearing-mode change (type 1 = result/event). */
export async function pushHearingState(page: Page, payload: { mode?: 'off' | 'anc' | 'transparency'; gain?: number }): Promise<void> {
  await page.evaluate((p) => {
    const w = window as Window & { AudioAppKit?: { notify?: (c: string, t: number, p?: Uint8Array) => void } }
    const bytes = new TextEncoder().encode(
      JSON.stringify({ capability: 'com.bragi.capability.audio.hearing-modes', event: 'state', payload: p }),
    )
    w.AudioAppKit?.notify?.('capability', 1, bytes)
  }, payload)
}

/** Native → Space: the grant authority refuses a capability (type 2 = refusal). */
export async function refuseCapability(
  page: Page,
  capability: string,
  reason: 'NOT_GRANTED' | 'CAPABILITY_UNKNOWN' | 'NOT_SUPPORTED' = 'NOT_GRANTED',
): Promise<void> {
  await page.evaluate(
    ({ capability, reason }) => {
      const w = window as Window & { AudioAppKit?: { notify?: (c: string, t: number, p?: Uint8Array) => void } }
      const bytes = new TextEncoder().encode(JSON.stringify({ capability, reason }))
      w.AudioAppKit?.notify?.('capability', 2, bytes)
    },
    { capability, reason },
  )
}

/** Host → Space: the network state changes (fires the SDK's optional listener if a Space installed one). */
export async function setNetworkState(page: Page, state: 'online' | 'offline' | 'degraded'): Promise<void> {
  await page.evaluate((s) => {
    const w = window as Window & { bragi?: { networkState?: string; onNetworkStateChange?: ((s: string) => void) | null } }
    if (!w.bragi) return
    w.bragi.networkState = s
    if (typeof w.bragi.onNetworkStateChange === 'function') w.bragi.onNetworkStateChange(s)
  }, state)
}
