export const APP_NAME = "BrowserHub";

export interface EnvironmentColorOption {
  value: string;
  label: string;
}

export const ENVIRONMENT_COLORS: EnvironmentColorOption[] = [
  { value: "#0F6B5B", label: "松绿" },
  { value: "#2F5F8A", label: "靛蓝" },
  { value: "#5B4B8A", label: "鸢尾" },
  { value: "#A34A7B", label: "梅红" },
  { value: "#B05A2A", label: "赭橙" },
  { value: "#8A6A24", label: "琥珀" },
  { value: "#4A6670", label: "蓝灰" },
  { value: "#6B6F68", label: "岩灰" },
];

export const DEFAULT_ENVIRONMENT_COLOR = ENVIRONMENT_COLORS[0].value;

export const SORT_OPTIONS = [
  { value: "recent", label: "最近启动" },
  { value: "name", label: "名称" },
  { value: "created", label: "创建时间" },
] as const;

export type EnvironmentSort = (typeof SORT_OPTIONS)[number]["value"];
