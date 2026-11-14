import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "@/lib/ipc";
import type { Environment, EnvironmentStats } from "@/types/environment";

const MAX_PARALLEL_SCANS = 2;

interface UseEnvironmentStatsResult {
  stats: Record<string, EnvironmentStats>;
  loadingIds: string[];
  isScanning: boolean;
  refreshAll: () => Promise<void>;
  scanOne: (environmentId: string) => Promise<void>;
}

async function runPool(
  ids: string[],
  worker: (id: string) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(MAX_PARALLEL_SCANS, ids.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor];
        cursor += 1;
        await worker(id);
      }
    }),
  );
}

export function useEnvironmentStats(
  environments: Environment[],
): UseEnvironmentStatsResult {
  const [stats, setStats] = useState<Record<string, EnvironmentStats>>({});
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const requested = useRef(new Set<string>());
  const statsRef = useRef<Record<string, EnvironmentStats>>({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  const setLoading = useCallback((id: string, loading: boolean) => {
    setLoadingIds((current) => {
      if (loading) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((item) => item !== id);
    });
  }, []);

  const scanOne = useCallback(
    async (environmentId: string, force = false) => {
      if (!force && requested.current.has(environmentId)) {
        return;
      }
      requested.current.add(environmentId);
      setLoading(environmentId, true);

      try {
        const result = await call<EnvironmentStats>("get_environment_stats", {
          environmentId,
        });
        if (mounted.current) {
          setStats((current) => ({ ...current, [environmentId]: result }));
        }
      } catch {
        requested.current.delete(environmentId);
      } finally {
        if (mounted.current) {
          setLoading(environmentId, false);
        }
      }
    },
    [setLoading],
  );

  const scanMany = useCallback(
    async (ids: string[], force: boolean) => {
      await runPool(ids, async (id) => {
        await scanOne(id, force);
      });
    },
    [scanOne],
  );

  useEffect(() => {
    if (environments.length === 0) {
      return;
    }

    const pending = environments
      .filter(
        (environment) =>
          !statsRef.current[environment.id] &&
          !requested.current.has(environment.id),
      )
      .map((environment) => environment.id);

    if (pending.length === 0) {
      return;
    }

    // Delay the initial disk walk so it never competes with first paint.
    const timer = window.setTimeout(() => {
      void scanMany(pending, false);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [environments, scanMany]);

  const refreshAll = useCallback(async () => {
    const ids = environments.map((environment) => environment.id);
    requested.current.clear();
    await scanMany(ids, true);
  }, [environments, scanMany]);

  return {
    stats,
    loadingIds,
    isScanning: loadingIds.length > 0,
    refreshAll,
    scanOne: (id) => scanOne(id, true),
  };
}
