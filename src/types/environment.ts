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
