export interface Backup {
  id: string;
  environmentId: string;
  environmentName: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
  note: string | null;
  environmentExists: boolean;
}

export interface BackupEnvironmentInput {
  environmentId: string;
  note?: string | null;
}
