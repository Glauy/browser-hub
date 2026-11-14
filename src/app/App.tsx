import { useState } from "react";
import type { AppView } from "@/app/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { FatalScreen, SplashScreen } from "@/components/layout/SplashScreen";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { call, getErrorMessage } from "@/lib/ipc";
import { useBackups } from "@/hooks/useBackups";
import { useBootstrap } from "@/hooks/useBootstrap";
import { useEnvironments } from "@/hooks/useEnvironments";
import { BackupsPage } from "@/features/backups/BackupsPage";
import { EnvironmentsPage } from "@/features/environments/EnvironmentsPage";
import { OnboardingPage } from "@/features/onboarding/OnboardingPage";
import { SettingsPage } from "@/features/settings/SettingsPage";

export function App() {
  const { toast } = useToast();
  const bootstrap = useBootstrap();
  const environments = useEnvironments();
  const backups = useBackups(true);
  const [view, setView] = useState<AppView>("environments");

  if (bootstrap.loading && !bootstrap.data) {
    return <SplashScreen />;
  }

  if (!bootstrap.data) {
    return (
      <FatalScreen
        message={
          bootstrap.error ??
          "无法读取 BrowserHub 配置。请检查应用数据目录的访问权限。"
        }
        action={
          <Button variant="primary" onClick={() => void bootstrap.reload()}>
            重试
          </Button>
        }
      />
    );
  }

  const data = bootstrap.data;

  if (data.needsSetup) {
    return (
      <OnboardingPage
        bootstrap={data}
        onCompleted={async () => {
          await bootstrap.reload();
          await Promise.all([
            environments.reload(),
            environments.refreshStatuses(),
            backups.reload(),
          ]);
          setView("environments");
        }}
      />
    );
  }

  const runningCount = environments.environments.filter(
    (environment) => environment.lastStatus === "running",
  ).length;

  const environmentCount = environments.loading
    ? data.environmentCount
    : environments.environments.length;
  const backupCount = backups.loading ? data.backupCount : backups.backups.length;

  const openDataDirectory = async () => {
    try {
      await call("open_directory", { path: data.settings.environmentRootDir });
    } catch (cause) {
      toast({
        title: "无法打开环境根目录",
        description: getErrorMessage(cause),
        variant: "error",
      });
    }
  };

  return (
    <AppShell
      activeView={view}
      environmentCount={environmentCount}
      runningCount={runningCount}
      backupCount={backupCount}
      settings={data.settings}
      defaultBrowser={data.defaultBrowser}
      onNavigate={setView}
      onOpenSettings={() => setView("settings")}
      onOpenDataDirectory={() => void openDataDirectory()}
    >
      {view === "environments" ? (
        <EnvironmentsPage
          environments={environments.environments}
          browsers={data.browsers}
          settings={data.settings}
          loading={environments.loading}
          error={environments.error}
          refreshingStatus={environments.refreshingStatus}
          lastStatusRefresh={environments.lastStatusRefresh}
          onReload={environments.reload}
          onRefreshStatuses={environments.refreshStatuses}
          onApplyStatus={environments.applyStatusInfo}
          onCreateBackup={backups.createBackup}
          onOpenSettings={() => setView("settings")}
        />
      ) : null}

      {view === "backups" ? (
        <BackupsPage
          backups={backups.backups}
          environments={environments.environments}
          settings={data.settings}
          loading={backups.loading}
          error={backups.error}
          onReload={backups.reload}
          onCreateBackup={backups.createBackup}
          onRestoreBackup={backups.restoreBackup}
          onDeleteBackup={backups.deleteBackup}
          onEnvironmentsChanged={() => {
            void environments.reload();
            void environments.refreshStatuses();
          }}
        />
      ) : null}

      {view === "settings" ? (
        <SettingsPage
          settings={data.settings}
          browsers={data.browsers}
          defaultBrowser={data.defaultBrowser}
          appDataDir={data.appDataDir}
          installDir={data.installDir}
          appVersion={data.appVersion}
          environmentCount={environmentCount}
          backupCount={backupCount}
          onSettingsUpdated={bootstrap.updateSettings}
          onBootstrapReload={bootstrap.reload}
          onNavigate={setView}
        />
      ) : null}
    </AppShell>
  );
}
