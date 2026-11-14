export interface BrowserConfig {
  id: string;
  name: string;
  executablePath: string;
  version: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DetectedChrome {
  executablePath: string;
  version: string | null;
  source: string;
}

export interface CreateBrowserConfigInput {
  executablePath: string;
  name?: string | null;
}

export interface UpdateBrowserConfigInput {
  id: string;
  name?: string | null;
  executablePath?: string | null;
  isDefault?: boolean | null;
}
