(() => {
  const params = new URLSearchParams(location.search);
  const stored = localStorage.getItem("pc_remote_token") || "";
  let token = params.get("token") || stored;

  const hostLabel = document.getElementById("hostLabel");
  const statusLine = document.getElementById("statusLine");
  const metaLine = document.getElementById("metaLine");
  const pairPanel = document.getElementById("pairPanel");
  const tokenInput = document.getElementById("tokenInput");
  const saveToken = document.getElementById("saveToken");
  const toast = document.getElementById("toast");
  const buttons = [...document.querySelectorAll("[data-action]")];

  function showToast(message, isError = false) {
    toast.hidden = false;
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  function setToken(next) {
    token = String(next || "").trim();
    if (token) localStorage.setItem("pc_remote_token", token);
    else localStorage.removeItem("pc_remote_token");
    pairPanel.hidden = Boolean(token);
    if (token && params.get("token") !== token) {
      const url = new URL(location.href);
      url.searchParams.set("token", token);
      history.replaceState({}, "", url);
    }
  }

  async function api(path, options = {}) {
    if (!token) throw new Error("Missing access token");
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    };
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function formatUptime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }

  async function refreshStatus() {
    if (!token) {
      hostLabel.textContent = "Token needed";
      statusLine.textContent = "Paste the access token from your PC.";
      metaLine.textContent = "";
      pairPanel.hidden = false;
      return;
    }
    try {
      const s = await api("/api/status");
      hostLabel.textContent = s.hostname || "PC online";
      statusLine.textContent = `Online as ${s.user}`;
      metaLine.textContent = `${s.platform} · up ${formatUptime(s.uptimeSec)} · free RAM ${s.freeMemMb} MB`;
    } catch (err) {
      hostLabel.textContent = "Can't reach PC";
      statusLine.textContent = err.message;
      metaLine.textContent = "Same Wi‑Fi? Is the companion still running?";
    }
  }

  async function runAction(action) {
    const body = { action };
    if (action === "notify") {
      const message = prompt("Alert text", "Hello from your phone");
      if (message === null) return;
      body.message = message;
    }
    if (action === "open-url") {
      const url = prompt("Open this link on your PC", "https://");
      if (!url) return;
      body.url = url;
    }
    if (action === "lock" || action === "sleep") {
      const ok = confirm(
        action === "lock"
          ? "Lock this PC now?"
          : "Put this PC to sleep now?"
      );
      if (!ok) return;
    }

    buttons.forEach((b) => (b.disabled = true));
    try {
      await api("/api/action", {
        method: "POST",
        body: JSON.stringify(body),
      });
      showToast(
        action === "notify"
          ? "Alert sent"
          : action === "open-url"
            ? "Opened on PC"
            : action === "lock"
              ? "Lock requested"
              : "Sleep requested"
      );
      await refreshStatus();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => runAction(btn.dataset.action));
  });

  saveToken.addEventListener("click", async () => {
    setToken(tokenInput.value);
    showToast(token ? "Token saved" : "Token cleared");
    await refreshStatus();
  });

  setToken(token);
  if (token) tokenInput.value = token;
  refreshStatus();
  setInterval(refreshStatus, 8000);
})();
