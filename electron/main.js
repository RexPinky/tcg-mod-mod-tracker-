// =====================================
// FEATURE FLAGS (BETA CODE FREEZE)
// =====================================

const psList = require("ps-list").default;
const chokidar = require("chokidar");
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

console.log("🚀 Electron main process started");

// ================= CONFIG =================
const GAME_PROCESS_NAME = "Card Shop Simulator.exe";
const MODS_DIR = "E:\SteamLibrary\steamapps\common\TCG Card Shop Simulator\BepInEx\plugins"; 
const CRASH_DIR = "E:/SteamLibrary/steamapps/common/TCG Card Shop Simulator/BepInEx/Crash_Report";

const EXIT_GRACE_PERIOD = 5000; // ms
// =========================================

let mainWindow;
let gameRunning = false;
let expectedGameExit = false;
let exitTimer = null;
let modHistory = [];

// ================= GAME DETECTION =================
async function checkGameProcess() {
  const processes = await psList();
  const found = processes.some(
    (p) => p.name.toLowerCase() === GAME_PROCESS_NAME.toLowerCase()
  );

  if (found !== gameRunning) {
    const previousState = gameRunning;
    gameRunning = found;

    // Game stopped → maybe crash
    if (previousState && !gameRunning) {
      exitTimer = setTimeout(() => {
        if (!expectedGameExit) {
          handleCrash();
        } else {
          console.log("✅ Game closed normally (no crash)");
        }
        expectedGameExit = false;
        exitTimer = null;
      }, EXIT_GRACE_PERIOD);
    }

    console.log(gameRunning ? "🟢 Game detected running" : "🔴 Game not running");

    if (mainWindow) {
      mainWindow.webContents.send("game-status", {
        running: gameRunning,
        timestamp: Date.now()
      });
    }
  }
}

// ================= MOD WATCHER =================
function startModWatcher() {
  const watcher = chokidar.watch(MODS_DIR, {
    ignoreInitial: true,
    persistent: true,
    depth: 2
  });

  watcher.on("add", (p) => sendModEvent("added", p));
  watcher.on("change", (p) => sendModEvent("changed", p));
  watcher.on("unlink", (p) => sendModEvent("removed", p));

  console.log("📁 Mod watcher started");
}

function sendModEvent(action, filePath) {
  const fileName = path.basename(filePath);
  const message = `Mod ${action}: ${fileName} (gameRunning=${gameRunning})`;

  const event = {
    action,
    fileName,
    gameRunning,
    message,
    timestamp: Date.now()
  };

  console.log(message);

  modHistory.unshift(event);
  modHistory = modHistory.slice(0, 20);

  if (mainWindow) {
    mainWindow.webContents.send("mod-event", event);
  }
}

// ================= PHASE 5 INTELLIGENCE =================
function analyzeCrash(snapshot) {
  if (!snapshot.mods || snapshot.mods.length === 0) {
    return {
      suspectedMod: null,
      confidenceScore: 0,
      reason: "No recent mod activity before crash"
    };
  }

  const scored = snapshot.mods.map((mod, index) => {
    let score = 0;

    // Game running = high risk
    if (mod.gameRunning) score += 5;

    // Recency bonus
    score += Math.max(0, 5 - index);

    // UPDATED ACTION RISK RULES
    switch (mod.action) {
      case "removed": score += 6; break;   // 🔥 Highest risk
      case "changed": score += 4; break;
      case "added":   score += 2; break;
    }

    return { ...mod, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  return {
    suspectedMod: top.fileName,
    confidenceScore: top.score,
    reason: `High-risk action detected: ${top.message}`
  };
}

// ================= CRASH HANDLING =================
function handleCrash() {
  const now = Date.now();

  const snapshot = {
    readableTime: new Date(now).toLocaleString(),
    timestamp: now,
    message:
      modHistory.length > 0
        ? `Crash detected after: ${modHistory[0].message}`
        : "Crash detected (no recent mod changes)",
    mods: modHistory
  };

  const analysis = analyzeCrash(snapshot);

  const enrichedSnapshot = {
    ...snapshot,
    analysis
  };

  console.log("💥 CRASH DETECTED");
  console.log(enrichedSnapshot.message);

  saveCrashSnapshot(enrichedSnapshot);

  if (mainWindow) {
    mainWindow.webContents.send("crash-detected", enrichedSnapshot);
  }
}

function saveCrashSnapshot(snapshot) {
  if (!fs.existsSync(CRASH_DIR)) {
    fs.mkdirSync(CRASH_DIR, { recursive: true });
  }

  const filePath = path.join(CRASH_DIR, `crash-${snapshot.timestamp}.txt`);

  const text = `
==== TCG CARD SHOP SIMULATOR CRASH REPORT ====

Crash Time   : ${snapshot.readableTime}
Timestamp    : ${snapshot.timestamp}

Summary
--------
${snapshot.message}

Likely Cause
------------
${snapshot.analysis.suspectedMod
  ? `${snapshot.analysis.suspectedMod}
(${snapshot.analysis.reason})`
  : "No mod could be confidently identified"}

Recent Mod Activity
-------------------
${snapshot.mods.length
  ? snapshot.mods.map(
      (m, i) =>
        `${i + 1}. ${m.message} @ ${new Date(m.timestamp).toLocaleTimeString()}`
    ).join("\n")
  : "No recent mod activity"}

============================================
`.trim();

  fs.writeFileSync(filePath, text);
  console.log(`💾 Crash report saved → ${filePath}`);
}

// ================= ELECTRON SETUP =================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadURL("http://localhost:5173");
}

// ================= TIMERS =================
setInterval(checkGameProcess, 3000);

// ================= IPC =================
ipcMain.handle("get-app-status", async () => ({
  electron: "running",
  time: new Date().toLocaleTimeString()
}));

// ================= LIFECYCLE =================
app.whenReady().then(() => {
  createWindow();
  startModWatcher();
});

app.on("before-quit", () => {
  expectedGameExit = true;
  if (exitTimer) clearTimeout(exitTimer);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
