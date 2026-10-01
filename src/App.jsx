import { useEffect, useState } from "react";

const styles = {
  page: {
    minHeight: "100vh",
    margin: 0,
    padding: "24px",
    fontFamily: '"Segoe UI", "Avenir Next", "Trebuchet MS", sans-serif',
    color: "#102018",
    background:
      "radial-gradient(900px 420px at 0% 0%, rgba(46, 168, 120, 0.18), transparent 55%), linear-gradient(165deg, #f3faf6 0%, #e7f1eb 45%, #dfeae3 100%)",
  },
  brand: {
    margin: 0,
    fontSize: "clamp(1.8rem, 4vw, 2.4rem)",
    letterSpacing: "-0.03em",
    lineHeight: 1.1,
  },
  sub: { margin: "6px 0 0", color: "#4d655a", fontSize: "0.95rem" },
  banner: {
    marginTop: 16,
    padding: "14px 16px",
    borderRadius: 12,
    background: "#12352a",
    color: "#e8f7f0",
  },
  grid: {
    display: "grid",
    gap: 14,
    marginTop: 18,
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  },
  panel: {
    background: "rgba(255,255,255,0.82)",
    border: "1px solid rgba(16,32,24,0.08)",
    borderRadius: 14,
    padding: 16,
    boxShadow: "0 10px 30px rgba(16,32,24,0.06)",
  },
  h2: { margin: "0 0 10px", fontSize: "1.05rem" },
  muted: { color: "#5b7267", fontSize: "0.9rem", lineHeight: 1.45 },
  crash: {
    border: "2px solid #c24b3c",
    background: "#fff6f4",
    borderRadius: 12,
    padding: 14,
  },
  btn: {
    marginTop: 10,
    border: 0,
    borderRadius: 10,
    padding: "10px 14px",
    background: "#1f8f68",
    color: "#fff",
    fontWeight: 650,
    cursor: "pointer",
  },
  modalBg: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },
  modal: {
    background: "#fff",
    padding: 24,
    maxWidth: 560,
    width: "100%",
    borderRadius: 12,
  },
};

export default function App() {
  const [game, setGame] = useState(null);
  const [mods, setMods] = useState([]);
  const [crash, setCrash] = useState(null);
  const [install, setInstall] = useState(null);
  const [betaAccepted, setBetaAccepted] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem("tcg_v060_disclaimer_accepted");
    setBetaAccepted(accepted === "true");

    const api = window.tcg;
    if (!api) return undefined;

    api.getInstallInfo?.().then(setInstall).catch(() => {});
    const offGame = api.onGameStatus(setGame);
    const offMod = api.onModEvent((e) =>
      setMods((p) => [e, ...p].slice(0, 12))
    );
    const offCrash = api.onCrashDetected(setCrash);
    const offInstall = api.onInstallInfo?.(setInstall);

    return () => {
      offGame?.();
      offMod?.();
      offCrash?.();
      offInstall?.();
    };
  }, []);

  function acceptDisclaimer() {
    localStorage.setItem("tcg_v060_disclaimer_accepted", "true");
    setBetaAccepted(true);
  }

  async function reloadPaths() {
    if (!window.tcg?.reloadInstall) return;
    const next = await window.tcg.reloadInstall();
    setInstall(next);
  }

  return (
    <div style={styles.page}>
      {!betaAccepted && (
        <div style={styles.modalBg}>
          <div style={styles.modal}>
            <h2>Game 1.0 Compatibility Update</h2>
            <p>
              <strong>TCG Mod & Crash Tracker 0.6.0</strong> targets{" "}
              <strong>TCG Card Shop Simulator 1.0 / 1.01 / 1.02</strong>.
            </p>
            <p>
              After the 1.0 launch, many Early Access (0.70.x) mods need updates.
              This release focuses on finding your install automatically and
              diagnosing crashes — it still does not modify mods or saves.
            </p>
            <h4>What changed</h4>
            <ul>
              <li>Auto-detects Steam install (no hardcoded E: path)</li>
              <li>Shows detected game/build info</li>
              <li>Watches BepInEx logs for exception signals</li>
              <li>Flags expansion/texture mods as higher risk on 1.0</li>
            </ul>
            <label style={{ display: "block", marginTop: 12 }}>
              <input
                type="checkbox"
                checked={disclaimerChecked}
                onChange={(e) => setDisclaimerChecked(e.target.checked)}
              />{" "}
              I understand this remains diagnostic-only.
            </label>
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button
                onClick={() => window.close()}
                style={{ marginRight: 8 }}
              >
                Exit
              </button>
              <button
                disabled={!disclaimerChecked}
                onClick={acceptDisclaimer}
                style={styles.btn}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <header>
        <h1 style={styles.brand}>TCG Mod & Crash Tracker</h1>
        <p style={styles.sub}>v0.6.0 · Game 1.0 compatibility</p>
      </header>

      <div style={styles.banner}>
        <strong>Game 1.0 is live.</strong> Reinstall BepInEx after updating the
        game, then update or remove mods still built for Early Access 0.70.x —
        especially expansion / texture / card-art packs.
      </div>

      <div style={styles.grid}>
        <section style={styles.panel}>
          <h2 style={styles.h2}>Install</h2>
          {install?.ok ? (
            <>
              <p>
                <strong>Found</strong> via {install.source}
              </p>
              <p style={styles.muted}>{install.gamePath}</p>
              <p style={styles.muted}>
                Build: {install.version?.label || "unknown"}
              </p>
            </>
          ) : (
            <>
              <p>
                <strong>Game folder not found</strong>
              </p>
              <p style={styles.muted}>
                Set <code>gamePath</code> in config or env{" "}
                <code>TCG_GAME_PATH</code>.
              </p>
              {install?.configPath && (
                <p style={styles.muted}>{install.configPath}</p>
              )}
            </>
          )}
          {(install?.warnings || []).map((w, i) => (
            <p key={i} style={{ ...styles.muted, color: "#8a5a12" }}>
              {w}
            </p>
          ))}
          <button style={styles.btn} onClick={reloadPaths}>
            Rescan install
          </button>
        </section>

        <section style={styles.panel}>
          <h2 style={styles.h2}>Game Status</h2>
          <p>{game?.running ? "🟢 Game Running" : "🔴 Game Not Running"}</p>
          <p style={styles.muted}>
            Watches common process names for the 1.0 PC build.
          </p>
        </section>

        <section style={styles.panel}>
          <h2 style={styles.h2}>Mod Activity</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {mods.map((m, i) => (
              <li key={`${m.timestamp}-${i}`}>{m.message}</li>
            ))}
          </ul>
          {mods.length === 0 && (
            <p style={styles.muted}>No mod activity detected yet</p>
          )}
        </section>

        <section style={styles.panel}>
          <h2 style={styles.h2}>Crash Intelligence</h2>
          {crash ? (
            <div style={styles.crash}>
              <strong>Crash Detected</strong>
              <p>{crash.message}</p>
              <p style={styles.muted}>{crash.readableTime}</p>
              {crash.trigger && (
                <p style={styles.muted}>Trigger: {crash.trigger}</p>
              )}
              {crash.analysis?.suspectedMod && (
                <>
                  <hr />
                  <p>
                    <strong>Likely Cause:</strong> {crash.analysis.suspectedMod}
                  </p>
                  <p style={styles.muted}>{crash.analysis.reason}</p>
                </>
              )}
            </div>
          ) : (
            <p style={styles.muted}>No crashes detected</p>
          )}
        </section>
      </div>
    </div>
  );
}
