const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tcg", {
  getAppStatus: () => ipcRenderer.invoke("get-app-status"),
  getInstallInfo: () => ipcRenderer.invoke("get-install-info"),
  reloadInstall: () => ipcRenderer.invoke("reload-install"),

  onGameStatus: (cb) => {
    const listener = (_, d) => cb(d);
    ipcRenderer.on("game-status", listener);
    return () => ipcRenderer.removeListener("game-status", listener);
  },

  onModEvent: (cb) => {
    const listener = (_, d) => cb(d);
    ipcRenderer.on("mod-event", listener);
    return () => ipcRenderer.removeListener("mod-event", listener);
  },

  onCrashDetected: (cb) => {
    const listener = (_, d) => cb(d);
    ipcRenderer.on("crash-detected", listener);
    return () => ipcRenderer.removeListener("crash-detected", listener);
  },

  onInstallInfo: (cb) => {
    const listener = (_, d) => cb(d);
    ipcRenderer.on("install-info", listener);
    return () => ipcRenderer.removeListener("install-info", listener);
  },
});
