export type EnvironmentSourceType = "managed" | "imported";

export type EnvironmentStatus = "unknown" | "running" | "stopped" | "error";

export interface Environment {
  id: string;
  name: string;
  description: string | null;
  userDataDir: string;
  sourceType: EnvironmentSourceType;
  browserConfigId: string;
  color: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  lastLaunchedAt: string | null;
  lastStatus: EnvironmentStatus;
  /** The environment the plain Chrome shortcut resolves to (system junction). */
  isDefaultProfile: boolean;
}

export interface SystemDefaultState {
  exists: boolean;
  /** User Data is a junction pointing at env_default (managed). */
  isManaged: boolean;
  /** The junction target (raw). */
  linkTarget: string | null;
  /** True when User Data is a plain directory (not yet managed). */
  isOriginalRealDir: boolean;
  /** Where the original Chrome data was saved during takeover. */
  originalBackupPath: string | null;
  /** Does the managed env_default directory exist? */
  defaultProfileDirExists: boolean;
  /** Is a plain (no-args) Chrome currently running against User Data? */
  defaultChromeRunning: boolean;
}

/** Special "系统默认 Chrome" entry rendered at the top of the env list. */
export interface SystemDefaultRow {
  managed: boolean;
  userDataDir: string;
  status: EnvironmentStatus;
  sizeBytes: number;
  fileCount: number;
  defaultChromeRunning: boolean;
  originalBackupPath: string | null;
}

export interface EnvironmentStatusInfo {
  environmentId: string;
  status: EnvironmentStatus;
  pid: number | null;
  checkedAt: string;
  reliable: boolean;
  reason: string | null;
}

export interface EnvironmentStats {
  environmentId: string;
  sizeBytes: number;
  fileCount: number;
  measuredAt: string;
}

export interface DirectoryInspection {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  writable: boolean;
  isChromeUserDataDir: boolean;
  isProfileDirectory: boolean;
  suggestedUserDataDir: string | null;
  profileCount: number;
  alreadyManaged: boolean;
  freeBytes: number | null;
  message: string | null;
}

export interface DirectorySuggestion {
  path: string;
  label: string;
  available: boolean;
  recommended: boolean;
}

export interface StorageInfo {
  path: string;
  accessible: boolean;
  totalBytes: number | null;
  availableBytes: number | null;
  environmentCount: number;
}

export interface CreateEnvironmentInput {
  name: string;
  description?: string | null;
  color?: string | null;
  parentDirectory?: string | null;
}

export interface UpdateEnvironmentInput {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
}

export interface ImportEnvironmentInput {
  userDataDir: string;
  name: string;
  description?: string | null;
  color?: string | null;
}
