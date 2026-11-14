import { useCallback, useEffect, useRef, useState } from "react";
import { call, getErrorMessage } from "@/lib/ipc";
import type { Backup, BackupEnvironmentInput } from "@/types/backup";

interface UseBackupsResult {
  backups: Backup[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createBackup: (input: BackupEnvironmentInput) => Promise<Backup>;
  restoreBackup: (backupId: string) => Promise<void>;
  deleteBackup: (backupId: string) => Promise<void>;
}

export function useBackups(enabled: boolean): UseBackupsResult {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }
    setError(null);
    try {
      const result = await call<Backup[]>("list_backups");
      if (mounted.current) {
        setBackups(result);
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
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      setLoading(true);
      void reload();
    }
  }, [enabled, reload]);

  const createBackup = useCallback(async (input: BackupEnvironmentInput) => {
    const backup = await call<Backup>("backup_environment", { input });
    if (mounted.current) {
      setBackups((current) => [backup, ...current]);
    }
    return backup;
  }, []);

  const restoreBackup = useCallback(async (backupId: string) => {
    await call("restore_environment", { backupId });
    if (mounted.current) {
      setBackups((current) =>
        current.map((backup) =>
          backup.id === backupId ? { ...backup, environmentExists: true } : backup,
        ),
      );
    }
  }, []);

  const deleteBackup = useCallback(async (backupId: string) => {
    await call("delete_backup", { backupId });
    if (mounted.current) {
      setBackups((current) => current.filter((backup) => backup.id !== backupId));
    }
  }, []);

  return {
    backups,
    loading,
    error,
    reload,
    createBackup,
    restoreBackup,
    deleteBackup,
  };
}
