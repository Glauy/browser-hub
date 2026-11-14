export {};

declare global {
  interface TauriInternals {
    invoke<T>(
      command: string,
      args?: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<T>;
  }

  interface Window {
    /**
     * Tauri injects this bridge into the webview. It is the same entry point
     * used by `@tauri-apps/api`, and is only read through `lib/ipc.ts`.
     */
    __TAURI_INTERNALS__?: TauriInternals;
  }
}
