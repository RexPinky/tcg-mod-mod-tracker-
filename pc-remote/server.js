"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { execFile } = require("child_process");
const { URL } = require("url");

const PORT = Number(process.env.PC_REMOTE_PORT || 8787);
const HOST = process.env.PC_REMOTE_HOST || "0.0.0.0";
const DATA_DIR = path.join(__dirname, ".data");
const TOKEN_FILE = path.join(DATA_DIR, "token.txt");
const PUBLIC_DIR = path.join(__dirname, "public");

function ensureToken() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(TOKEN_FILE)) {
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  }
  const token = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

const TOKEN = ensureToken();

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function isAuthed(req, url) {
  const header = req.headers["authorization"] || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const queryToken = url.searchParams.get("token") || "";
  const provided = bearer || queryToken;
  if (!provided || provided.length !== TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(TOKEN));
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 15000, ...opts }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        error: err ? String(err.message) : null,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim(),
      });
    });
  });
}

async function actionStatus() {
  return {
    ok: true,
    hostname: os.hostname(),
    platform: os.platform(),
    uptimeSec: Math.floor(os.uptime()),
    freeMemMb: Math.round(os.freemem() / 1024 / 1024),
    totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
    user: os.userInfo().username,
    time: new Date().toISOString(),
  };
}

async function actionNotify(message) {
  const text = String(message || "Hello from PC Remote").slice(0, 200);
  const platform = os.platform();

  if (platform === "win32") {
    const safe = text.replace(/'/g, "''");
    const ps = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      "$n = New-Object System.Windows.Forms.NotifyIcon",
      "$n.Icon = [System.Drawing.SystemIcons]::Information",
      "$n.Visible = $true",
      `$n.ShowBalloonTip(4000, 'PC Remote', '${safe}', [System.Windows.Forms.ToolTipIcon]::Info)`,
      "Start-Sleep -Seconds 5",
      "$n.Dispose()",
    ].join("; ");
    return run("powershell.exe", ["-NoProfile", "-Command", ps]);
  }
  if (platform === "darwin") {
    return run("osascript", ["-e", `display notification "${text.replace(/"/g, '\\"')}" with title "PC Remote"`]);
  }
  // Linux: try notify-send, then fall back to wall
  const notify = await run("notify-send", ["PC Remote", text]);
  if (notify.ok) return notify;
  return run("wall", [text]);
}

async function actionOpenUrl(url) {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target)) {
    return { ok: false, error: "URL must start with http:// or https://" };
  }
  const platform = os.platform();
  if (platform === "win32") return run("cmd.exe", ["/c", "start", "", target]);
  if (platform === "darwin") return run("open", [target]);
  return run("xdg-open", [target]);
}

async function actionLock() {
  const platform = os.platform();
  if (platform === "win32") {
    return run("rundll32.exe", ["user32.dll,LockWorkStation"]);
  }
  if (platform === "darwin") {
    return run("osascript", [
      "-e",
      'tell application "System Events" to keystroke "q" using {control down, command down}',
    ]);
  }
  const locked = await run("loginctl", ["lock-session"]);
  if (locked.ok) return locked;
  return run("xdg-screensaver", ["lock"]);
}

async function actionSleep() {
  const platform = os.platform();
  if (platform === "win32") {
    return run("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)",
    ]);
  }
  if (platform === "darwin") {
    return run("pmset", ["sleepnow"]);
  }
  return run("systemctl", ["suspend"]);
}

const ALLOWED = new Set(["status", "notify", "open-url", "lock", "sleep"]);

async function handleAction(name, body) {
  switch (name) {
    case "status":
      return actionStatus();
    case "notify":
      return actionNotify(body.message);
    case "open-url":
      return actionOpenUrl(body.url);
    case "lock":
      return actionLock();
    case "sleep":
      return actionSleep();
    default:
      return { ok: false, error: "Unknown action" };
  }
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
    }[ext] || "application/octet-stream"
  );
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === "/") rel = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (!isAuthed(req, url)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized — check your access token" });
      return;
    }

    if (url.pathname === "/api/status" && req.method === "GET") {
      sendJson(res, 200, await actionStatus());
      return;
    }

    if (url.pathname === "/api/action" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const name = String(body.action || "");
        if (!ALLOWED.has(name)) {
          sendJson(res, 400, { ok: false, error: "Action not allowed" });
          return;
        }
        const result = await handleAction(name, body);
        sendJson(res, result.ok ? 200 : 500, result);
      } catch (err) {
        sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res, url.pathname);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, HOST, () => {
  const addrs = lanAddresses();
  console.log("");
  console.log("PC Remote Companion is running");
  console.log("------------------------------");
  console.log(`Access token: ${TOKEN}`);
  console.log(`Local:        http://127.0.0.1:${PORT}/?token=${TOKEN}`);
  if (addrs.length) {
    for (const ip of addrs) {
      console.log(`Phone (Wi‑Fi): http://${ip}:${PORT}/?token=${TOKEN}`);
    }
  } else {
    console.log("Phone (Wi‑Fi): no LAN IPv4 address detected yet");
  }
  console.log("");
  console.log("Open the Phone URL on your phone (same Wi‑Fi as this PC).");
  console.log("Keep this window open while you want remote control.");
  console.log("");
});
