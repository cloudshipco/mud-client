import { $ } from "bun";
import { existsSync, chmodSync, renameSync, unlinkSync } from "fs";
import { join, dirname } from "path";

// Version from package.json - embedded at import time
import packageJson from "../../package.json";

const GITHUB_REPO = "cloudshipco/mud-client";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

export type Environment = "git" | "binary" | "unknown";

interface GitHubRelease {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  environment: Environment;
  error?: string;
}

interface UpdateResult {
  success: boolean;
  message: string;
  requiresRestart?: boolean;
}

// Map platform/arch to binary name
const BINARY_MAP: Record<string, string> = {
  "darwin-arm64": "twilite-macos-arm64",
  "darwin-x64": "twilite-macos-x64",
  "linux-x64": "twilite-linux-x64",
  "linux-arm64": "twilite-linux-arm64",
  "win32-x64": "twilite-windows-x64.exe",
};

export class Updater {
  private gitRoot: string | null = null;

  getCurrentVersion(): string {
    return packageJson.version;
  }

  detectEnvironment(): Environment {
    // Check if we're running from a git repository
    // Walk up from the main file location to find .git
    const mainFile = Bun.main;
    let dir = dirname(mainFile);

    // Walk up to find .git directory (max 5 levels)
    for (let i = 0; i < 5; i++) {
      const gitPath = join(dir, ".git");
      if (existsSync(gitPath)) {
        this.gitRoot = dir;
        return "git";
      }
      const parent = dirname(dir);
      if (parent === dir) break; // Reached root
      dir = parent;
    }

    // Check if running as compiled binary
    // In compiled Bun binaries, process.execPath points to the binary itself
    // and import.meta.path will be embedded
    if (process.execPath && !process.execPath.includes("bun")) {
      return "binary";
    }

    return "unknown";
  }

  getPlatformBinary(): string | null {
    const platform = process.platform;
    const arch = process.arch;
    const key = `${platform}-${arch}`;
    return BINARY_MAP[key] || null;
  }

  async checkForUpdate(): Promise<UpdateCheckResult> {
    const currentVersion = this.getCurrentVersion();
    const environment = this.detectEnvironment();

    try {
      const response = await fetch(GITHUB_API_URL, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": `mud-client/${currentVersion}`,
        },
      });

      if (!response.ok) {
        return {
          currentVersion,
          latestVersion: null,
          updateAvailable: false,
          environment,
          error: `GitHub API error: ${response.status}`,
        };
      }

      const release: GitHubRelease = await response.json();
      // Remove 'v' prefix if present (e.g., "v0.2.0" -> "0.2.0")
      const latestVersion = release.tag_name.replace(/^v/, "");
      const updateAvailable = this.isNewerVersion(latestVersion, currentVersion);

      return {
        currentVersion,
        latestVersion,
        updateAvailable,
        environment,
      };
    } catch (error) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        environment,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private isNewerVersion(latest: string, current: string): boolean {
    const latestParts = latest.split(".").map(Number);
    const currentParts = current.split(".").map(Number);

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const l = latestParts[i] || 0;
      const c = currentParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  async updateViaGit(): Promise<UpdateResult> {
    if (!this.gitRoot) {
      // Re-detect to set gitRoot
      if (this.detectEnvironment() !== "git" || !this.gitRoot) {
        return {
          success: false,
          message: "Not running from a git repository",
        };
      }
    }

    try {
      // Fetch latest changes
      const fetchResult = await $`cd ${this.gitRoot} && /usr/bin/git fetch origin main`.quiet();
      if (fetchResult.exitCode !== 0) {
        return {
          success: false,
          message: `Git fetch failed: ${fetchResult.stderr.toString()}`,
        };
      }

      // Check if there are updates
      const behindResult = await $`cd ${this.gitRoot} && /usr/bin/git rev-list HEAD...origin/main --count`.quiet();
      const behindCount = parseInt(behindResult.stdout.toString().trim(), 10);

      if (behindCount === 0) {
        return {
          success: true,
          message: "Already up to date",
          requiresRestart: false,
        };
      }

      // Pull updates
      const pullResult = await $`cd ${this.gitRoot} && /usr/bin/git pull origin main`.quiet();
      if (pullResult.exitCode !== 0) {
        return {
          success: false,
          message: `Git pull failed: ${pullResult.stderr.toString()}`,
        };
      }

      return {
        success: true,
        message: `Updated from git (${behindCount} commit${behindCount > 1 ? "s" : ""}). Restart the client to use the new version.`,
        requiresRestart: true,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Git update failed",
      };
    }
  }

  async updateViaBinary(): Promise<UpdateResult> {
    const binaryName = this.getPlatformBinary();
    if (!binaryName) {
      return {
        success: false,
        message: `Unsupported platform: ${process.platform}-${process.arch}`,
      };
    }

    try {
      // Get latest release info
      const response = await fetch(GITHUB_API_URL, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": `mud-client/${this.getCurrentVersion()}`,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          message: `Failed to fetch release info: ${response.status}`,
        };
      }

      const release: GitHubRelease = await response.json();
      const asset = release.assets.find((a) => a.name === binaryName);

      if (!asset) {
        return {
          success: false,
          message: `Binary not found for this platform: ${binaryName}`,
        };
      }

      // Download new binary
      const downloadResponse = await fetch(asset.browser_download_url);
      if (!downloadResponse.ok) {
        return {
          success: false,
          message: `Failed to download binary: ${downloadResponse.status}`,
        };
      }

      const execPath = process.execPath;
      const tempPath = `${execPath}.new`;
      const oldPath = `${execPath}.old`;

      // Write to temp file
      const buffer = await downloadResponse.arrayBuffer();
      await Bun.write(tempPath, buffer);

      // Make executable (Unix only)
      if (process.platform !== "win32") {
        chmodSync(tempPath, 0o755);
      }

      // Rename current to .old, temp to current
      if (existsSync(oldPath)) {
        unlinkSync(oldPath);
      }
      renameSync(execPath, oldPath);
      renameSync(tempPath, execPath);

      // Clean up old binary
      try {
        unlinkSync(oldPath);
      } catch {
        // Ignore - might be in use on Windows
      }

      return {
        success: true,
        message: `Updated to ${release.tag_name}. Restart the client to use the new version.`,
        requiresRestart: true,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Binary update failed",
      };
    }
  }

  getManualUpdateMessage(latestVersion: string): string {
    return `Update available: v${latestVersion} (current: v${this.getCurrentVersion()})\nDownload: ${GITHUB_RELEASES_URL}`;
  }
}
