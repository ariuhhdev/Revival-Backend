import fs from "node:fs";
import path from "node:path";

function normalizeAbsolutePath(input: string): string {
  return path.resolve(input);
}

function samePath(a: string, b: string): boolean {
  return normalizeAbsolutePath(a).toLowerCase() === normalizeAbsolutePath(b).toLowerCase();
}

function resolveInstallRoot(): string {
  const envRoot = process.env.REVIVAL_INSTALL_ROOT?.trim();
  if (envRoot) {
    return normalizeAbsolutePath(envRoot);
  }

  return normalizeAbsolutePath(path.join(__dirname, "..", ".."));
}

function resolveDataRoot(installRoot: string): string {
  const envRoot = process.env.REVIVAL_DATA_ROOT?.trim();
  if (envRoot) {
    return normalizeAbsolutePath(envRoot);
  }

  return installRoot;
}

const installRoot = resolveInstallRoot();
const dataRoot = resolveDataRoot(installRoot);

export function getRevivalInstallRoot(): string {
  return installRoot;
}

export function getRevivalDataRoot(): string {
  return dataRoot;
}

export function isUsingSeparateRevivalDataRoot(): boolean {
  return !samePath(installRoot, dataRoot);
}

export function revivalInstallPath(...parts: string[]): string {
  return path.join(installRoot, ...parts);
}

export function revivalDataPath(...parts: string[]): string {
  return path.join(dataRoot, ...parts);
}

export function revivalDataReadPath(...parts: string[]): string {
  const candidate = revivalDataPath(...parts);
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return revivalInstallPath(...parts);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFileIfMissing(relativePath: string): void {
  const sourcePath = revivalInstallPath(...relativePath.split("/"));
  const targetPath = revivalDataPath(...relativePath.split("/"));

  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
    return;
  }

  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectoryContentsIfMissing(relativePath: string): void {
  const sourceRoot = revivalInstallPath(...relativePath.split("/"));
  const targetRoot = revivalDataPath(...relativePath.split("/"));

  if (!fs.existsSync(sourceRoot)) {
    return;
  }

  ensureDir(targetRoot);

  const entries = fs.readdirSync(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const childRelativePath = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      copyDirectoryContentsIfMissing(childRelativePath);
      continue;
    }

    copyFileIfMissing(childRelativePath);
  }
}

export function ensureRevivalDataLayout(): void {
  ensureDir(dataRoot);
  ensureDir(revivalDataPath("logs"));
  ensureDir(revivalDataPath("exports"));
  ensureDir(revivalDataPath("responses"));
  ensureDir(revivalDataPath("src", "config"));
  ensureDir(revivalDataPath("static", "profiles"));
  ensureDir(revivalDataPath("static", "ClientSettings"));
  ensureDir(revivalDataPath("static", "hotfixes"));
  ensureDir(revivalDataPath("public", "items", "custom-groups"));

  if (!isUsingSeparateRevivalDataRoot()) {
    return;
  }

  copyDirectoryContentsIfMissing("static/hotfixes");
  copyDirectoryContentsIfMissing("static/profiles");
  copyDirectoryContentsIfMissing("static/athenaprofiles/Profile Presets");
  copyDirectoryContentsIfMissing("responses");
  copyDirectoryContentsIfMissing("static/ClientSettings/config");
}
