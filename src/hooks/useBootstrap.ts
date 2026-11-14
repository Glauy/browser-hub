import { useCallback, useEffect, useState } from "react";
import { call, getErrorMessage } from "@/lib/ipc";
import type { AppSettings, BootstrapState } from "@/types/settings";

interface UseBootstrapResult {
  data: BootstrapState | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  updateSettings: (settings: AppSettings) => void;
}

export function useBootstrap(): UseBootstrapResult {
  const [data, setData] = useState<BootstrapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const next = await call<BootstrapState>("get_bootstrap_state");
      setData(next);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback((settings: AppSettings) => {
    setData((current) => (current ? { ...current, settings } : current));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, updateSettings };
}
