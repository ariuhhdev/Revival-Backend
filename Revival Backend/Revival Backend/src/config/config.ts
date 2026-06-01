import fs from "node:fs";
import path from "node:path";
import ini from "ini";
import { revivalDataPath } from "./paths";

export type RevivalConfigValue = string | boolean | number | undefined;
export type RevivalConfig = Record<string, RevivalConfigValue>;

export const DEFAULT_CONFIG: Readonly<Record<string, string>> = Object.freeze({
  RufusStage: "1",
  WaterLevel: "1",
  SaveArenaPoints: "false",
  UseWaterStorm: "false",
  StartBackendOnLaunch: "true",
  BackendInfiniteRenderEnabled: "true",
  SwapCooldownEnabled: "false",
  DisableBackendUpdateCheck: "false",
  UseDarkMode: "true",
  BackgroundImagePath: "",
  BackgroundBlur: "15",
  BackgroundParticlesEnabled: "true",
  BackgroundParticlesOpacity: "1.0",
  DialogBlurEnabled: "true",
  StartupAnimationEnabled: "true",
  LastShownUpdateNotesVersion: "",
});

const DEFAULT_CONFIG_PATH = revivalDataPath("src", "config", "config.ini");

let cachedConfig: RevivalConfig | null = null;

export function getConfigPath(): string {
  return DEFAULT_CONFIG_PATH;
}

function mergeMissingDefaults(config: RevivalConfig): { mergedConfig: RevivalConfig; changed: boolean } {
  const mergedConfig: RevivalConfig = { ...config };
  let changed = false;

  for (const [key, defaultValue] of Object.entries(DEFAULT_CONFIG)) {
    if (!(key in mergedConfig)) {
      mergedConfig[key] = defaultValue;
      changed = true;
    }
  }

  return { mergedConfig, changed };
}

export function ensureConfigFile(configPath = DEFAULT_CONFIG_PATH): string {
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, ini.stringify(DEFAULT_CONFIG));
  }

  return configPath;
}

export function readConfig(configPath = DEFAULT_CONFIG_PATH): RevivalConfig {
  if (cachedConfig) return cachedConfig;

  const resolvedPath = ensureConfigFile(configPath);
  const parsedConfig = ini.parse(fs.readFileSync(resolvedPath, "utf-8")) as RevivalConfig;
  const { mergedConfig, changed } = mergeMissingDefaults(parsedConfig);

  if (changed) {
    fs.writeFileSync(resolvedPath, ini.stringify(mergedConfig));
  }

  cachedConfig = mergedConfig;
  return mergedConfig;
}

export function writeConfig(config: RevivalConfig, configPath = DEFAULT_CONFIG_PATH): void {
  const resolvedPath = ensureConfigFile(configPath);
  const mergedConfig: RevivalConfig = { ...DEFAULT_CONFIG, ...config };
  fs.writeFileSync(resolvedPath, ini.stringify(mergedConfig));
}
