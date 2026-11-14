import { useCallback, useEffect, useRef, useState } from "react";
import { call, getErrorMessage } from "@/lib/ipc";
import type { Environment, EnvironmentStatusInfo } from "@/types/environment";

const STATUS_POLL_INTERVAL_MS = 20_000;

interface UseEnvironmentsResult {
  environments: Environment[];
  loading: boolean;
  error: string | null;
  refreshingStatus: boolean;
  lastStatusRefresh: Date | null;
  reload: () => Promise<void>;
  refreshStatuses: () => Promise<void>;
  applyStatusInfo: (info: EnvironmentStatusInfo) => void;
}

function applyStatuses(
  environments: Environment[],
  statuses: EnvironmentStatusInfo[],
): Environment[] {
  const byId = new Map(statuses.map((status) => [status.environmentId, status]));
  return environments.map((environment) => {
    const status = byId.get(environment.id);
    return status ? { ...environment, lastStatus: status.status } : environment;
  });
}

export function useEnvironments(): UseEnvironmentsResult {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [lastStatusRefresh, setLastStatusRefresh] = useState<Date | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const list = await call<Environment[]>("list_environments");
      if (mounted.current) {
        setEnvironments(list);
      }
    } catch (cause) {
      if (mounted.current) {
        setError(getErrorMessage(cause));
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, []);

  const refreshStatuses = useCallback(async () => {
    if (document.hidden) {
      return;
    }
    setRefreshingStatus(true);
    try {
      const statuses = await call<EnvironmentStatusInfo[]>(
        "refresh_environment_status",
      );
      if (mounted.current) {
        setEnvironments((current) => applyStatuses(current, statuses));
        setLastStatusRefresh(new Date());
      }
    } catch {
      // Status polling is best-effort; the next tick will try again.
    } finally {
      if (mounted.current) {
        setRefreshingStatus(false);
      }
    }
  }, []);

  const applyStatusInfo = useCallback((info: EnvironmentStatusInfo) => {
    setEnvironments((current) => applyStatuses(current, [info]));
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();
    void refreshStatuses();

    const timer = window.setInterval(() => {
      void refreshStatuses();
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [reload, refreshStatuses]);

  return {
    environments,
    loading,
    error,
    refreshingStatus,
    lastStatusRefresh,
    reload,
    refreshStatuses,
    applyStatusInfo,
  };
}
