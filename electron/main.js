"use strict";

const psList = require("ps-list").default;
const chokidar = require("chokidar");
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const {
  GAME_PROCESS_NAMES,
  resolveGameInstall,
  ensureDir,
} = require("./paths");

console.log("TCG Mod & Crash Tracker started (Game 1.0 compatibility)");

const EXIT_GRACE_PERIOD = 5000;
const APP_VERSION = "0.6.0";
const TARGET_GAME = "TCG Card Shop Simulator 1.0+";

let mainWindow = null;
let gameRunning = false;
let expectedGameExit = false;
let exitTimer = null;
let modHistory = [];
let install = null;
let lastLogSize = 0;
let logWatcher = null;
let modWatcher = null;

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getInstallSnapshot() {
  return {
    appVersion: APP_VERSION,
    targetGame: TARGET_GAME,
    ok: Boolean(install?.ok),
    source: install?.source || "none",
    gamePath: install?.gamePath || null,
    modsDir: install?.modsDir || null,
    crashDir: install?.crashDir || null,
    logPath: install?.logPath || null,
    version: install?.version || null,
    warnings: install?.warnings || [],
    configPath: install?.configPath || null,
  };
}

function refreshInstall() {
  install = resolveGameInstall(app.getPath("userData"));
  ensureDir(install.crashDir);
  if (install.modsDir) ensureDir(install.modsDir);
  console.log("Resolved install:", getInstallSnapshot());
  broadcast("install-info", getInstallSnapshot());
  return install;
}

async function checkGameProcess() {
  const processes = await psList();
  const found = processes.some((p) =>
    GAME_PROCESS_NAMES.some(
      (name) => p.name.toLowerCase() === name.toLowerCase()
    )
  );

  if (found !== gameRunning) {
    const previousState = gameRunning;
    gameRunning = found;

    if (previousState && !gameRunning) {
      exitTimer = setTimeout(() => {
        if (!expectedGameExit) {
          handleCrash({ trigger: "process-exit" });
        } else {
          console.log("Game closed normally (no crash)");
        }
        expectedGameExit = false;
        exitTimer = null;
      }, EXIT_GRACE_PERIOD);
    }

    if (gameRunning && exitTimer) {
      clearTimeout(exitTimer);
      exitTimer = null;
      expectedGameExit = false;
    }

    console.log(gameRunning ? "Game detected running" : "Game not running");
    broadcast("game-status", {
      running: gameRunning,
      timestamp: Date.now(),
      processNames: GAME_PROCESS_NAMES,
    });
  }
}

function sendModEvent(action, filePath) {
  const fileName = path.basename(filePath);
  const message = `Mod ${action}: ${fileName} (gameRunning=${gameRunning})`;
  const event = {
    action,
    fileName,
    filePath,
    gameRunning,
    message,
    timestamp: Date.now(),
  };

  console.log(message);
  modHistory.unshift(event);
  modHistory = modHistory.slice(0, 40);
  broadcast("mod-event", event);
}

function startModWatcher() {
  if (modWatcher) {
    modWatcher.close().catch(() => {});
    modWatcher = null;
  }

  const watchRoots = [];
  if (install?.modsDir && fs.existsSync(path.dirname(install.modsDir))) {
    watchRoots.push(install.modsDir);
  }
  if (install?.melonModsDir && fs.existsSync(install.melonModsDir)) {
    watchRoots.push(install.melonModsDir);
  }

  if (!watchRoots.length) {
    console.warn("No mod folders to watch yet");
    return;
  }

  for (const root of watchRoots) {
    ensureDir(root);
  }

  modWatcher = chokidar.watch(watchRoots, {
    ignoreInitial: true,
    persistent: true,
    depth: 3,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  });

  modWatcher.on("add", (p) => sendModEvent("added", p));
  modWatcher.on("change", (p) => sendModEvent("changed", p));
  modWatcher.on("unlink", (p) => sendModEvent("removed", p));
  console.log("Mod watcher started:", watchRoots.join(", "));
}

function analyzeCrash(snapshot) {
  if (!snapshot.mods || snapshot.mods.length === 0) {
    return {
      suspectedMod: null,
      confidenceScore: 0,
      reason: snapshot.logHint
        ? `Log signal: ${snapshot.logHint}`
        : "No recent mod activity before crash",
    };
  }

  const scored = snapshot.mods.map((mod, index) => {
    let score = 0;
    if (mod.gameRunning) score += 5;
    score += Math.max(0, 5 - index);

    switch (mod.action) {
      case "removed":
        score += 6;
        break;
      case "changed":
        score += 4;
        break;
      case "added":
        score += 2;
        break;
      default:
        break;
    }

    // 1.0: asset/texture mods are higher risk after Unity content expansion
    const lower = mod.fileName.toLowerCase();
    if (
      lower.includes("texture") ||
      lower.includes("asset") ||
      lower.includes("expansion") ||
      lower.includes("cardart")
    ) {
      score += 2;
    }

    return { ...mod, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  return {
    suspectedMod: top.fileName,
    confidenceScore: top.score,
    reason: `High-risk action detected: ${top.message}${
      snapshot.logHint ? ` | Log: ${snapshot.logHint}` : ""
    }`,
  };
}

function handleCrash({ trigger = "process-exit", logHint = null } = {}) {
  const now = Date.now();
  const snapshot = {
    readableTime: new Date(now).toLocaleString(),
    timestamp: now,
    trigger,
    logHint,
    gameVersion: install?.version || null,
    trackerVersion: APP_VERSION,
    message:
      modHistory.length > 0
        ? `Crash detected after: ${modHistory[0].message}`
        : logHint
          ? `Crash/exception signal: ${logHint}`
          : "Crash detected (no recent mod changes)",
    mods: [...modHistory],
  };

  const analysis = analyzeCrash(snapshot);
  const enrichedSnapshot = { ...snapshot, analysis };

  console.log("CRASH DETECTED", trigger, enrichedSnapshot.message);
  saveCrashSnapshot(enrichedSnapshot);
  broadcast("crash-detected", enrichedSnapshot);
}

function saveCrashSnapshot(snapshot) {
  const crashDir = install?.crashDir || path.join(app.getPath("userData"), "Crash_Report");
  ensureDir(crashDir);

  const filePath = path.join(crashDir, `crash-${snapshot.timestamp}.txt`);
  const text = `
==== TCG CARD SHOP SIMULATOR CRASH REPORT ====

Tracker     : ${snapshot.trackerVersion} (Game 1.0 compatibility)
Crash Time  : ${snapshot.readableTime}
Timestamp   : ${snapshot.timestamp}
Trigger     : ${snapshot.trigger}
Game Build  : ${snapshot.gameVersion?.label || "unknown"}

Summary
--------
${snapshot.message}

Likely Cause
------------
${
  snapshot.analysis.suspectedMod
    ? `${snapshot.analysis.suspectedMod}
(${snapshot.analysis.reason})`
    : "No mod could be confidently identified"
}

Recent Mod Activity
-------------------
${
  snapshot.mods.length
    ? snapshot.mods
        .map(
          (m, i) =>
            `${i + 1}. ${m.message} @ ${new Date(m.timestamp).toLocaleTimeString()}`
        )
        .join("\n")
    : "No recent mod activity"
}

1.0 Notes
---------
After updating to game 1.0 / 1.01 / 1.02, reinstall BepInEx and update
mods that still target Early Access 0.70.x. Expansion/texture mods are
the most common crash source on the new Ascension content.

============================================
`.trim();

  fs.writeFileSync(filePath, text);
  console.log(`Crash report saved → ${filePath}`);
}

function scanLogForExceptions() {
  if (!install?.logPath || !fs.existsSync(install.logPath)) return;

  try {
    const stat = fs.statSync(install.logPath);
    if (stat.size < lastLogSize) lastLogSize = 0;
    if (stat.size === lastLogSize) return;

    const fd = fs.openSync(install.logPath, "r");
    const length = stat.size - lastLogSize;
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, lastLogSize);
    fs.closeSync(fd);
    lastLogSize = stat.size;

    const chunk = buffer.toString("utf8");
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    const hit = lines.reverse().find((line) =>
      /exception|fatal|crash|nullreference|harmony/i.test(line)
    );

    if (hit && gameRunning) {
      handleCrash({ trigger: "bepinex-log", logHint: hit.slice(0, 240) });
    }
  } catch (err) {
    console.warn("Log scan failed:", err.message);
  }
}

function startLogWatcher() {
  if (logWatcher) {
    clearInterval(logWatcher);
    logWatcher = null;
  }
  if (!install?.logPath) return;

  if (fs.existsSync(install.logPath)) {
    lastLogSize = fs.statSync(install.logPath).size;
  } else {
    lastLogSize = 0;
  }

  logWatcher = setInterval(scanLogForExceptions, 4000);
  console.log("Watching BepInEx log:", install.logPath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
  mainWindow.loadURL(devUrl);
}

function createWindowFallback() {
  // If Vite isn't up yet, still open; user can refresh.
  createWindow();
}

ipcMain.handle("get-app-status", async () => ({
  electron: "running",
  appVersion: APP_VERSION,
  targetGame: TARGET_GAME,
  time: new Date().toLocaleTimeString(),
  install: getInstallSnapshot(),
}));

ipcMain.handle("get-install-info", async () => getInstallSnapshot());

ipcMain.handle("reload-install", async () => {
  refreshInstall();
  startModWatcher();
  startLogWatcher();
  return getInstallSnapshot();
});

app.whenReady().then(() => {
  refreshInstall();
  createWindowFallback();
  startModWatcher();
  startLogWatcher();
  setInterval(checkGameProcess, 3000);
});

app.on("before-quit", () => {
  expectedGameExit = true;
  if (exitTimer) clearTimeout(exitTimer);
  if (logWatcher) clearInterval(logWatcher);
  if (modWatcher) modWatcher.close().catch(() => {});
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
