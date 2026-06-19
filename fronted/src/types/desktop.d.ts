// Types for the Electron preload bridge (desktop/electron/preload.js).
// Present only when the app runs inside the HermesAI desktop shell; undefined
// in a plain browser, so all access must be optional-chained.
export {};

declare global {
  interface Window {
    hermesDesktop?: {
      isDesktop: boolean;
      platform: string;
      /** Restart the bundled FastClaw gateway so it reloads its config. */
      restartFastclaw?: () => Promise<{ ok: boolean; error?: string }>;
    };
  }
}
