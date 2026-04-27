const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tcg", {
  onGameStatus: (cb) =>
    ipcRenderer.on("game-status", (_, d) => cb(d)),

  onModEvent: (cb) =>
    ipcRenderer.on("mod-event", (_, d) => cb(d)),

  onCrashDetected: (cb) =>
    ipcRenderer.on("crash-detected", (_, d) => cb(d))
});