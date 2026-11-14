import type { ApiResult } from "@/types/api";
import type { Backup } from "@/types/backup";
import type { BrowserConfig, CreateBrowserConfigInput, DetectedChrome, UpdateBrowserConfigInput } from "@/types/browser";
import type {
  CreateEnvironmentInput,
  DirectoryInspection,
  Environment,
  EnvironmentStats,
  EnvironmentStatusInfo,
  ImportEnvironmentInput,
  StorageInfo,
  UpdateEnvironmentInput,
} from "@/types/environment";
import type { AppSettings, BootstrapState } from "@/types/settings";

/**
 * Development-only in-memory backend.
 *
 * It keeps the UI usable in a plain browser (`npm run dev`) while the real
 * implementation lives in Rust. It is loaded lazily and never bundled in a
 * production build.
 */

const NOW = Date.now();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const CHROME_PATH = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";

const params = new URLSearchParams(window.location.search);

let settings: AppSettings = {
  environmentRootDir: "D:\\BrowserProfiles",
  backupRootDir: "D:\\BrowserProfiles\\backups",
  closeBehavior: "exit",
  launchOnStartup: false,
  minimizeToTray: false,
  setupCompleted: !params.has("onboarding"),
};

let browsers: BrowserConfig[] = [
  {
    id: "browser_9a1c4e",
    name: "Google Chrome",
    executablePath: CHROME_PATH,
    version: "131.0.6778.205",
    isDefault: true,
    createdAt: minutesAgo(60 * 24 * 30),
    updatedAt: minutesAgo(60 * 24 * 2),
  },
];

let environments: Environment[] = [
  {
    id: "env_8f31a2",
    name: "Google 工作账号",
    description: "Workspace、后台系统与团队工具",
    userDataDir: "D:\\BrowserProfiles\\env_8f31a2",
    sourceType: "managed",
    browserConfigId: browsers[0].id,
    color: "#0F6B5B",
    icon: null,
    createdAt: minutesAgo(60 * 24 * 24),
    updatedAt: minutesAgo(60 * 24 * 24),
    lastLaunchedAt: minutesAgo(26),
    lastStatus: "running",
  },
  {
    id: "env_7d29b5",
    name: "Google 个人账号",
    description: "个人邮箱、订阅与影音服务",
    userDataDir: "D:\\BrowserProfiles\\env_7d29b5",
    sourceType: "managed",
    browserConfigId: browsers[0].id,
    color: "#2F5F8A",
    icon: null,
    createdAt: minutesAgo(60 * 24 * 18),
    updatedAt: minutesAgo(60 * 24 * 18),
    lastLaunchedAt: minutesAgo(60 * 26),
    lastStatus: "stopped",
  },
  {
    id: "env_c51e83",
    name: "测试环境",
    description: "验证新功能与第三方登录流程",
    userDataDir: "E:\\OldChrome\\TestingProfile",
    sourceType: "imported",
    browserConfigId: browsers[0].id,
    color: "#B05A2A",
    icon: null,
    createdAt: minutesAgo(60 * 24 * 9),
    updatedAt: minutesAgo(60 * 24 * 9),
    lastLaunchedAt: minutesAgo(60 * 24 * 3),
    lastStatus: "stopped",
  },
  {
    id: "env_2b7f04",
    name: "客户演示",
    description: "移动硬盘中的独立演示环境",
    userDataDir: "F:\\ClientDemos\\chrome-profile",
    sourceType: "imported",
    browserConfigId: browsers[0].id,
    color: "#5B4B8A",
    icon: null,
    createdAt: minutesAgo(60 * 24 * 4),
    updatedAt: minutesAgo(60 * 24 * 4),
    lastLaunchedAt: null,
    lastStatus: "unknown",
  },
];

let backups: Backup[] = [
  {
    id: "backup_31ce8a",
    environmentId: "env_7d29b5",
    environmentName: "Google 个人账号",
    path: "D:\\BrowserProfiles\\backups\\Google-个人账号-20261110-214012",
    sizeBytes: 864_112_640,
    createdAt: minutesAgo(60 * 24 * 4),
    note: "升级 Chrome 前备份",
    environmentExists: true,
  },
  {
    id: "backup_9b20d1",
    environmentId: "env_8f31a2",
    environmentName: "Google 工作账号",
    path: "D:\\BrowserProfiles\\backups\\Google-工作账号-20261106-090155",
    sizeBytes: 1_220_000_000,
    createdAt: minutesAgo(60 * 24 * 8),
    note: null,
    environmentExists: true,
  },
];

const stats = new Map<string, number>([
  ["env_8f31a2", 1_288_490_188],
  ["env_7d29b5", 902_103_040],
  ["env_c51e83", 440_401_920],
  ["env_2b7f04", 2_800_000_000],
]);

function ok<T>(data: T): ApiResult<T> {
  return { success: true, data };
}

function fail<T>(code: string, message: string): ApiResult<T> {
  return { success: false, error: { code, message } };
}

function delay(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 160));
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

function slugForDirectory(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 40) || "environment";
}

function statusInfo(environment: Environment): EnvironmentStatusInfo {
  return {
    environmentId: environment.id,
    status: environment.lastStatus,
    pid: environment.lastStatus === "running" ? 18320 : null,
    checkedAt: now(),
    reliable: environment.lastStatus !== "unknown",
    reason:
      environment.lastStatus === "unknown"
        ? "无法读取该环境对应的 Chrome 进程命令行。"
        : null,
  };
}

function sizeFor(environmentId: string): number {
  return stats.get(environmentId) ?? 320_000_000;
}

function withEnvironmentFlags(): Backup[] {
  return backups.map((backup) => ({
    ...backup,
    environmentExists: environments.some((environment) => environment.id === backup.environmentId),
  }));
}

function findEnvironment(environmentId: string): Environment | undefined {
  return environments.find((environment) => environment.id === environmentId);
}

function inspectDirectory(path: string): DirectoryInspection {
  const normalized = path.replace(/\//g, "\\").replace(/\\+$/, "");
  const basename = normalized.split("\\").filter(Boolean).pop() ?? "";
  const isProfileDirectory = /^(default|profile \d+)$/i.test(basename);
  const alreadyManaged = environments.some(
    (environment) => environment.userDataDir.toLowerCase() === normalized.toLowerCase(),
  );
  const parent = normalized.split("\\").slice(0, -1).join("\\");

  return {
    path: normalized,
    exists: true,
    isDirectory: true,
    writable: true,
    isChromeUserDataDir: !isProfileDirectory,
    isProfileDirectory,
    suggestedUserDataDir: isProfileDirectory ? parent : null,
    profileCount: isProfileDirectory ? 1 : 2,
    alreadyManaged,
    freeBytes: 687_194_767_360,
    message: isProfileDirectory
      ? "这是 Chrome 的 Profile 子目录，请选择它的上一级 User Data Directory。"
      : null,
  };
}

function defaultBackupRoot(): string {
  return settings.backupRootDir ?? `${settings.environmentRootDir}\\backups`;
}

function buildBootstrap(): BootstrapState {
  return {
    settings,
    browsers,
    defaultBrowser: browsers.find((browser) => browser.isDefault) ?? null,
    environmentCount: environments.length,
    backupCount: backups.length,
    needsSetup: !settings.setupCompleted,
    recommendedRoots: [
      {
        path: "D:\\BrowserProfiles",
        label: "D 盘",
        available: true,
        recommended: true,
      },
      {
        path: "C:\\Users\\Public\\BrowserProfiles",
        label: "公共目录",
        available: true,
        recommended: false,
      },
      {
        path: "C:\\Users\\glauy\\BrowserProfiles",
        label: "用户目录",
        available: true,
        recommended: false,
      },
    ],
    appVersion: "0.1.0",
    appDataDir: "C:\\Users\\glauy\\AppData\\Local\\forga.space\\BrowserHub",
    installDir: "C:\\Users\\glauy\\AppData\\Local\\Programs\\BrowserHub",
  };
}

export async function mockInvoke<T>(
  command: string,
  rawArgs?: Record<string, unknown>,
): Promise<ApiResult<T>> {
  await delay();
  const args = rawArgs ?? {};

  switch (command) {
    case "get_bootstrap_state":
      return ok(buildBootstrap()) as ApiResult<T>;

    case "get_app_settings":
      return ok(settings) as ApiResult<T>;

    case "update_app_settings": {
      const next = args.settings as AppSettings | undefined;
      if (!next) {
        return fail("VALIDATION_FAILED", "设置内容无效。") as ApiResult<T>;
      }
      settings = { ...settings, ...next };
      return ok(settings) as ApiResult<T>;
    }

    case "complete_setup": {
      const environmentRootDir = String(args.environmentRootDir ?? "").trim();
      if (!environmentRootDir) {
        return fail("VALIDATION_FAILED", "请选择一个环境根目录。") as ApiResult<T>;
      }
      const backupRootDir =
        typeof args.backupRootDir === "string" && args.backupRootDir.trim()
          ? args.backupRootDir.trim()
          : `${environmentRootDir}\\backups`;
      const chromeExecutablePath =
        typeof args.chromeExecutablePath === "string" ? args.chromeExecutablePath : null;

      if (chromeExecutablePath && !browsers.some((browser) => browser.executablePath === chromeExecutablePath)) {
        browsers = browsers.map((browser) => ({ ...browser, isDefault: false }));
        browsers.push({
          id: newId("browser"),
          name: "Google Chrome",
          executablePath: chromeExecutablePath,
          version: "131.0.6778.205",
          isDefault: true,
          createdAt: now(),
          updatedAt: now(),
        });
      }

      settings = {
        ...settings,
        environmentRootDir,
        backupRootDir,
        setupCompleted: true,
      };
      return ok(null) as ApiResult<T>;
    }

    case "select_directory":
      return ok(args.initialDir ? String(args.initialDir) : "D:\\BrowserProfiles") as ApiResult<T>;

    case "select_executable":
      return ok(CHROME_PATH) as ApiResult<T>;

    case "get_storage_info": {
      const path = typeof args.path === "string" ? args.path : settings.environmentRootDir;
      const info: StorageInfo = {
        path,
        accessible: true,
        totalBytes: 2_000_000_000_000,
        availableBytes: 687_194_767_360,
        environmentCount: environments.length,
      };
      return ok(info) as ApiResult<T>;
    }

    case "inspect_environment_directory": {
      const path = String(args.path ?? "");
      if (!path) {
        return fail("VALIDATION_FAILED", "请选择一个目录。") as ApiResult<T>;
      }
      return ok(inspectDirectory(path)) as ApiResult<T>;
    }

    case "list_environments":
      return ok([...environments]) as ApiResult<T>;

    case "create_environment": {
      const input = args.input as CreateEnvironmentInput;
      if (!input?.name?.trim()) {
        return fail("VALIDATION_FAILED", "请输入环境名称。") as ApiResult<T>;
      }
      const browser = browsers.find((candidate) => candidate.isDefault);
      if (!browser) {
        return fail("CHROME_NOT_FOUND", "尚未配置 Chrome，请先在设置中选择 Chrome 可执行文件。") as ApiResult<T>;
      }
      const root = (input.parentDirectory ?? settings.environmentRootDir).replace(/[\\/]+$/, "");
      const id = newId("env");
      const environment: Environment = {
        id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        userDataDir: `${root}\\${id}`,
        sourceType: "managed",
        browserConfigId: browser.id,
        color: input.color ?? "#0F6B5B",
        icon: null,
        createdAt: now(),
        updatedAt: now(),
        lastLaunchedAt: null,
        lastStatus: "stopped",
      };
      environments = [environment, ...environments];
      return ok(environment) as ApiResult<T>;
    }

    case "import_environment": {
      const input = args.input as ImportEnvironmentInput;
      if (!input?.userDataDir || !input.name?.trim()) {
        return fail("VALIDATION_FAILED", "请选择目录并填写环境名称。") as ApiResult<T>;
      }
      if (environments.some((environment) => environment.userDataDir.toLowerCase() === input.userDataDir.toLowerCase())) {
        return fail("ENVIRONMENT_ALREADY_IMPORTED", "该目录已经在一个浏览器环境中使用。") as ApiResult<T>;
      }
      const browser = browsers.find((candidate) => candidate.isDefault);
      if (!browser) {
        return fail("CHROME_NOT_FOUND", "尚未配置 Chrome，请先在设置中选择 Chrome 可执行文件。") as ApiResult<T>;
      }
      const id = newId("env");
      const environment: Environment = {
        id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        userDataDir: input.userDataDir,
        sourceType: "imported",
        browserConfigId: browser.id,
        color: input.color ?? "#4A6670",
        icon: null,
        createdAt: now(),
        updatedAt: now(),
        lastLaunchedAt: null,
        lastStatus: "stopped",
      };
      environments = [environment, ...environments];
      return ok(environment) as ApiResult<T>;
    }

    case "update_environment": {
      const input = args.input as UpdateEnvironmentInput;
      const environment = findEnvironment(input?.id);
      if (!environment) {
        return fail("ENVIRONMENT_NOT_FOUND", "环境不存在或已被移除。") as ApiResult<T>;
      }
      const updated: Environment = {
        ...environment,
        name: input.name.trim() || environment.name,
        description: input.description?.trim() || null,
        color: input.color ?? environment.color,
        updatedAt: now(),
      };
      environments = environments.map((item) => (item.id === updated.id ? updated : item));
      return ok(updated) as ApiResult<T>;
    }

    case "remove_environment": {
      const environmentId = String(args.environmentId ?? "");
      const environment = findEnvironment(environmentId);
      if (!environment) {
        return fail("ENVIRONMENT_NOT_FOUND", "环境不存在或已被移除。") as ApiResult<T>;
      }
      if (environment.lastStatus === "running") {
        return fail("ENVIRONMENT_ALREADY_RUNNING", "该环境正在运行，请先关闭 Chrome。") as ApiResult<T>;
      }
      environments = environments.filter((item) => item.id !== environmentId);
      return ok(null) as ApiResult<T>;
    }

    case "delete_environment": {
      const environmentId = String(args.environmentId ?? "");
      const environment = findEnvironment(environmentId);
      if (!environment) {
        return fail("ENVIRONMENT_NOT_FOUND", "环境不存在或已被移除。") as ApiResult<T>;
      }
      if (environment.lastStatus !== "stopped") {
        return fail("ENVIRONMENT_DIRECTORY_IN_USE", "无法确认该环境已退出，已拒绝删除。") as ApiResult<T>;
      }
      environments = environments.filter((item) => item.id !== environmentId);
      return ok(null) as ApiResult<T>;
    }

    case "launch_environment": {
      const environmentId = String(args.environmentId ?? "");
      const environment = findEnvironment(environmentId);
      if (!environment) {
        return fail("ENVIRONMENT_NOT_FOUND", "环境不存在或已被移除。") as ApiResult<T>;
      }
      if (environment.lastStatus === "running") {
        return fail("ENVIRONMENT_ALREADY_RUNNING", "该环境已经在运行中。") as ApiResult<T>;
      }
      const updated: Environment = { ...environment, lastStatus: "running", lastLaunchedAt: now() };
      environments = environments.map((item) => (item.id === environmentId ? updated : item));
      return ok(statusInfo(updated)) as ApiResult<T>;
    }

    case "get_environment_status": {
      const environment = findEnvironment(String(args.environmentId ?? ""));
      if (!environment) {
        return fail("ENVIRONMENT_NOT_FOUND", "环境不存在或已被移除。") as ApiResult<T>;
      }
      return ok(statusInfo(environment)) as ApiResult<T>;
    }

    case "refresh_environment_status": {
      const statuses = environments.map(statusInfo);
      return ok(statuses) as ApiResult<T>;
    }

    case "get_environment_stats": {
      const environmentId = String(args.environmentId ?? "");
      if (!findEnvironment(environmentId)) {
        return fail("ENVIRONMENT_NOT_FOUND", "环境不存在或已被移除。") as ApiResult<T>;
      }
      const result: EnvironmentStats = {
        environmentId,
        sizeBytes: sizeFor(environmentId),
        fileCount: 18_432,
        measuredAt: now(),
      };
      return ok(result) as ApiResult<T>;
    }

    case "open_directory":
      return ok(null) as ApiResult<T>;

    case "window_minimize":
      return ok(null) as ApiResult<T>;

    case "window_toggle_maximize":
      return ok(false) as ApiResult<T>;

    case "window_is_maximized":
      return ok(false) as ApiResult<T>;

    case "window_close":
      return ok(null) as ApiResult<T>;

    case "get_browser_configs":
      return ok([...browsers]) as ApiResult<T>;

    case "detect_chrome": {
      const detected: DetectedChrome[] = [
        { executablePath: CHROME_PATH, version: "131.0.6778.205", source: "常见安装位置" },
        {
          executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          version: "131.0.6778.205",
          source: "Program Files",
        },
      ];
      return ok(detected) as ApiResult<T>;
    }

    case "create_browser_config": {
      const input = args.input as CreateBrowserConfigInput;
      if (!input?.executablePath) {
        return fail("CHROME_PATH_INVALID", "请选择 Chrome 可执行文件。") as ApiResult<T>;
      }
      if (browsers.some((browser) => browser.executablePath.toLowerCase() === input.executablePath.toLowerCase())) {
        return fail("VALIDATION_FAILED", "该 Chrome 安装已经存在。") as ApiResult<T>;
      }
      const shouldBeDefault = browsers.length === 0;
      const browser: BrowserConfig = {
        id: newId("browser"),
        name: input.name?.trim() || "Google Chrome",
        executablePath: input.executablePath,
        version: "131.0.6778.205",
        isDefault: shouldBeDefault,
        createdAt: now(),
        updatedAt: now(),
      };
      browsers = [...browsers, browser];
      return ok(browser) as ApiResult<T>;
    }

    case "update_browser_config": {
      const input = args.input as UpdateBrowserConfigInput;
      const browser = browsers.find((item) => item.id === input?.id);
      if (!browser) {
        return fail("BROWSER_CONFIG_NOT_FOUND", "Chrome 配置不存在。") as ApiResult<T>;
      }
      if (input.isDefault) {
        browsers = browsers.map((item) => ({ ...item, isDefault: item.id === input.id }));
      }
      const updated: BrowserConfig = {
        ...browsers.find((item) => item.id === input.id)!,
        name: input.name?.trim() || browser.name,
        executablePath: input.executablePath ?? browser.executablePath,
        updatedAt: now(),
      };
      browsers = browsers.map((item) => (item.id === updated.id ? updated : item));
      return ok(updated) as ApiResult<T>;
    }

    case "delete_browser_config": {
      const browserConfigId = String(args.browserConfigId ?? "");
      if (browsers.length <= 1) {
        return fail("BROWSER_CONFIG_IN_USE", "至少需要保留一个 Chrome 配置。") as ApiResult<T>;
      }
      if (environments.some((environment) => environment.browserConfigId === browserConfigId)) {
        return fail("BROWSER_CONFIG_IN_USE", "仍有环境在使用这个 Chrome 安装。") as ApiResult<T>;
      }
      const wasDefault = browsers.find((browser) => browser.id === browserConfigId)?.isDefault ?? false;
      browsers = browsers.filter((browser) => browser.id !== browserConfigId);
      if (wasDefault && browsers.length > 0) {
        browsers = browsers.map((browser, index) => ({ ...browser, isDefault: index === 0 }));
      }
      return ok(null) as ApiResult<T>;
    }

    case "backup_environment": {
      const input = args.input as { environmentId: string; note?: string | null };
      const environment = findEnvironment(input?.environmentId);
      if (!environment) {
        return fail("ENVIRONMENT_NOT_FOUND", "环境不存在或已被移除。") as ApiResult<T>;
      }
      if (environment.lastStatus !== "stopped") {
        return fail("ENVIRONMENT_DIRECTORY_IN_USE", "请先完全退出该环境的 Chrome，再创建备份。") as ApiResult<T>;
      }
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const backup: Backup = {
        id: newId("backup"),
        environmentId: environment.id,
        environmentName: environment.name,
        path: `${defaultBackupRoot()}\\${slugForDirectory(environment.name)}-${stamp}`,
        sizeBytes: sizeFor(environment.id),
        createdAt: now(),
        note: input.note?.trim() || null,
        environmentExists: true,
      };
      backups = [backup, ...backups];
      return ok(backup) as ApiResult<T>;
    }

    case "list_backups":
      return ok(withEnvironmentFlags()) as ApiResult<T>;

    case "restore_environment": {
      const backup = backups.find((item) => item.id === String(args.backupId ?? ""));
      if (!backup) {
        return fail("BACKUP_NOT_FOUND", "备份不存在或已被删除。") as ApiResult<T>;
      }
      const environment = findEnvironment(backup.environmentId);
      if (!environment) {
        return fail("ENVIRONMENT_NOT_FOUND", "该备份对应的环境已被移除。") as ApiResult<T>;
      }
      if (environment.lastStatus !== "stopped") {
        return fail("ENVIRONMENT_DIRECTORY_IN_USE", "请先完全退出该环境的 Chrome，再恢复备份。") as ApiResult<T>;
      }
      environments = environments.map((item) =>
        item.id === environment.id ? { ...item, updatedAt: now(), lastStatus: "stopped" } : item,
      );
      return ok(null) as ApiResult<T>;
    }

    case "delete_backup": {
      const backupId = String(args.backupId ?? "");
      if (!backups.some((item) => item.id === backupId)) {
        return fail("BACKUP_NOT_FOUND", "备份不存在或已被删除。") as ApiResult<T>;
      }
      backups = backups.filter((item) => item.id !== backupId);
      return ok(null) as ApiResult<T>;
    }

    default:
      return fail("UNKNOWN_COMMAND", `开发预览后端不支持命令：${command}`) as ApiResult<T>;
  }
}
