import type { ApiResult } from "@/types/api";

export const TAURI_REQUIRED_MESSAGE = "此功能需要在 BrowserHub 桌面应用中运行。";

export function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.__TAURI_INTERNALS__?.invoke === "function"
  );
}

export class IpcError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "IpcError";
    this.code = code;
  }
}

function unwrap<T>(result: ApiResult<T>): T {
  if (result.success && result.data !== undefined) {
    return result.data;
  }

  throw new IpcError(
    result.error?.code ?? "UNKNOWN_ERROR",
    result.error?.message ?? "操作失败，请稍后重试。",
  );
}

/**
 * Single IPC boundary of the application. Business errors are returned as
 * `ApiResult` by Rust and converted into typed `IpcError`s here, so UI code
 * never has to inspect error envelopes.
 */
export async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriEnvironment()) {
    if (import.meta.env.DEV) {
      const { mockInvoke } = await import("./mock");
      return unwrap(await mockInvoke<T>(command, args));
    }
    throw new IpcError("TAURI_REQUIRED", TAURI_REQUIRED_MESSAGE);
  }

  let result: ApiResult<T>;
  try {
    result = await window.__TAURI_INTERNALS__!.invoke<ApiResult<T>>(
      command,
      args,
    );
  } catch (error) {
    console.error(`IPC command failed: ${command}`, error);
    const detail =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "Unknown IPC failure";
    throw new IpcError(
      "IPC_ERROR",
      `无法连接 BrowserHub 后台服务，请重新启动应用。（${detail}）`,
    );
  }

  return unwrap(result);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof IpcError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "操作失败，请稍后重试。";
}
