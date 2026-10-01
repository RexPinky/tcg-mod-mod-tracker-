"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const STEAM_APP_ID = "3070070";
const GAME_FOLDER_NAME = "TCG Card Shop Simulator";
const GAME_PROCESS_NAMES = [
  "Card Shop Simulator.exe",
  "CardShopSimulator.exe",
  "TCG Card Shop Simulator.exe",
];

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function parseLibraryFolders(vdfText) {
  if (!vdfText) return [];
  const paths = [];
  const pathRegex = /"path"\s+"([^"]+)"/gi;
  let match;
  while ((match = pathRegex.exec(vdfText))) {
    paths.push(match[1].replace(/\\\\/g, "\\"));
  }
  return paths;
}

function steamRootCandidates() {
  const home = os.homedir();
  const platform = os.platform();

  if (platform === "win32") {
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return unique([
      path.join(programFilesX86, "Steam"),
      path.join(programFiles, "Steam"),
      path.join(localAppData, "Programs", "Steam"),
      "D:\\Steam",
      "E:\\Steam",
      "E:\\SteamLibrary",
      "D:\\SteamLibrary",
      "F:\\SteamLibrary",
    ]);
  }

  if (platform === "darwin") {
    return unique([
      path.join(home, "Library", "Application Support", "Steam"),
    ]);
  }

  return unique([
    path.join(home, ".steam", "steam"),
    path.join(home, ".local", "share", "Steam"),
    path.join(home, ".var", "app", "com.valvesoftware.Steam", "data", "Steam"),
  ]);
}

function discoverSteamLibraries() {
  const libraries = [];

  for (const root of steamRootCandidates()) {
    const vdfPath = path.join(root, "steamapps", "libraryfolders.vdf");
    const vdf = readTextSafe(vdfPath);
    if (vdf) {
      for (const lib of parseLibraryFolders(vdf)) {
        libraries.push(lib);
      }
    }
    // Root itself may be a library (SteamLibrary-style installs)
    libraries.push(root);
  }

  return unique(libraries);
}

function gameDirFromLibrary(libraryRoot) {
  return path.join(libraryRoot, "steamapps", "common", GAME_FOLDER_NAME);
}

function readAppManifest(libraryRoot) {
  const manifestPath = path.join(
    libraryRoot,
    "steamapps",
    `appmanifest_${STEAM_APP_ID}.acf`
  );
  const text = readTextSafe(manifestPath);
  if (!text) return null;

  const pick = (key) => {
    const m = text.match(new RegExp(`"${key}"\\s+"([^"]+)"`, "i"));
    return m ? m[1] : null;
  };

  return {
    manifestPath,
    name: pick("name"),
    installdir: pick("installdir"),
    buildid: pick("buildid"),
    LastUpdated: pick("LastUpdated"),
    SizeOnDisk: pick("SizeOnDisk"),
  };
}

function loadUserConfig(userDataDir) {
  const configPath = path.join(userDataDir, "config.json");
  const text = readTextSafe(configPath);
  if (!text) return { configPath, config: {} };
  try {
    return { configPath, config: JSON.parse(text) };
  } catch {
    return { configPath, config: {} };
  }
}

function resolveGameInstall(userDataDir) {
  const { configPath, config } = loadUserConfig(userDataDir);
  const override = config.gamePath || process.env.TCG_GAME_PATH || null;

  if (override && fs.existsSync(override)) {
    const modsDir = path.join(override, "BepInEx", "plugins");
    const crashDir = path.join(override, "BepInEx", "Crash_Report");
    const logPath = path.join(override, "BepInEx", "LogOutput.log");
    return {
      ok: true,
      source: "config",
      gamePath: override,
      modsDir,
      crashDir,
      logPath,
      melonModsDir: path.join(override, "Mods"),
      configPath,
      version: {
        label: config.gameVersionHint || "User override",
        buildid: null,
        compatibleTarget: "1.0+",
      },
      warnings: [],
    };
  }

  const libraries = discoverSteamLibraries();
  const warnings = [];
  let best = null;

  for (const library of libraries) {
    const candidate = gameDirFromLibrary(library);
    if (!fs.existsSync(candidate)) continue;

    const manifest = readAppManifest(library);
    const modsDir = path.join(candidate, "BepInEx", "plugins");
    const crashDir = path.join(candidate, "BepInEx", "Crash_Report");
    const logPath = path.join(candidate, "BepInEx", "LogOutput.log");
    const hasBepInEx = fs.existsSync(path.join(candidate, "BepInEx"));

    const versionLabel = manifest?.buildid
      ? `Steam build ${manifest.buildid}`
      : "Installed (build unknown)";

    best = {
      ok: true,
      source: "steam",
      gamePath: candidate,
      modsDir,
      crashDir,
      logPath,
      melonModsDir: path.join(candidate, "Mods"),
      configPath,
      libraryRoot: library,
      manifest,
      version: {
        label: versionLabel,
        buildid: manifest?.buildid || null,
        name: manifest?.name || GAME_FOLDER_NAME,
        compatibleTarget: "1.0+",
      },
      warnings: hasBepInEx
        ? []
        : [
            "BepInEx folder not found yet. Install BepInEx 5.4.23.2 and launch the game once after updating to 1.0.",
          ],
    };
    break;
  }

  if (!best) {
    return {
      ok: false,
      source: "none",
      gamePath: null,
      modsDir: null,
      crashDir: path.join(userDataDir, "Crash_Report"),
      logPath: null,
      melonModsDir: null,
      configPath,
      version: {
        label: "Not found",
        buildid: null,
        compatibleTarget: "1.0+",
      },
      warnings: [
        "Could not auto-detect TCG Card Shop Simulator. Set gamePath in config.json or TCG_GAME_PATH.",
        `Edit: ${configPath}`,
      ],
    };
  }

  best.warnings = unique([...(best.warnings || []), ...warnings]);
  return best;
}

function ensureDir(dirPath) {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

module.exports = {
  STEAM_APP_ID,
  GAME_FOLDER_NAME,
  GAME_PROCESS_NAMES,
  resolveGameInstall,
  ensureDir,
  loadUserConfig,
};
