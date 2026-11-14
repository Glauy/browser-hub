import type { BrowserConfig } from "@/types/browser";
import type { DirectorySuggestion } from "@/types/environment";

export type CloseBehavior = "exit" | "minimize";

export interface AppSettings {
  environmentRootDir: string;
  backupRootDir: string | null;
  closeBehavior: CloseBehavior;
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  setupCompleted: boolean;
}

export interface BootstrapState {
  settings: AppSettings;
  browsers: BrowserConfig[];
  defaultBrowser: BrowserConfig | null;
  environmentCount: number;
  backupCount: number;
  needsSetup: boolean;
  recommendedRoots: DirectorySuggestion[];
  appVersion: string;
  appDataDir: string;
  installDir: string | null;
}

export interface CompleteSetupInput {
  environmentRootDir: string;
  backupRootDir?: string | null;
  chromeExecutablePath?: string | null;
}
