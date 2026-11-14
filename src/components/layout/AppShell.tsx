import { TitleBar } from "@/components/layout/TitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import type { ReactNode } from "react";
import type { AppView } from "@/app/navigation";
import type { BrowserConfig } from "@/types/browser";
import type { AppSettings } from "@/types/settings";

interface AppShellProps {
  activeView: AppView;
  environmentCount: number;
  runningCount: number;
  backupCount: number;
  settings: AppSettings;
  defaultBrowser: BrowserConfig | null;
  onNavigate: (view: AppView) => void;
  onOpenSettings: () => void;
  onOpenDataDirectory: () => void;
  children: ReactNode;
}

export function AppShell({
  activeView,
  environmentCount,
  runningCount,
  backupCount,
  settings,
  defaultBrowser,
  onNavigate,
  onOpenSettings,
  onOpenDataDirectory,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          activeView={activeView}
          environmentCount={environmentCount}
          runningCount={runningCount}
          backupCount={backupCount}
          settings={settings}
          defaultBrowser={defaultBrowser}
          onNavigate={onNavigate}
          onOpenSettings={onOpenSettings}
          onOpenDataDirectory={onOpenDataDirectory}
        />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
