import { useCallback, useEffect, useRef, useState } from "react";
import { call, getErrorMessage } from "@/lib/ipc";
import type { SystemDefaultRow } from "@/types/environment";

interface UseSystemDefaultRowResult {
  row: SystemDefaultRow | null;
  loading: boolean;
  launching: boolean;
  refresh: () => Promise<void>;
  launch: () => Promise<void>;
}

/**
 * Loads and maintains the special "系统默认 Chrome" list row: managed state,
 * live status and directory size. Refreshes together with the environment
 * status poll so both rows stay in sync.
 */
export function useSystemDefaultRow(): UseSystemDefaultRowResult {
  const [row, setRow] = useState<SystemDefaultRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await call<SystemDefaultRow>("get_system_default_row");
      if (mounted.current) {
        setRow(result);
      }
    } catch {
      // Best-effort: the row shows "未托管/未知" when unavailable.
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 20_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  const launch = useCallback(async () => {
    setLaunching(true);
    try {
      await call<number>("launch_system_default_chrome");
      await refresh();
    } catch (cause) {
      throw new Error(getErrorMessage(cause));
    } finally {
      if (mounted.current) {
        setLaunching(false);
      }
    }
  }, [refresh]);

  return { row, loading, launching, refresh, launch };
}
