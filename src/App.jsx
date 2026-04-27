import { useEffect, useState } from "react";

export default function App() {
  const [game, setGame] = useState(null);
  const [mods, setMods] = useState([]);
  const [crash, setCrash] = useState(null);

  // ✅ Beta disclaimer state
  const [betaAccepted, setBetaAccepted] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);

  // =========================
  // INIT / DISCLAIMER CHECK
  // =========================
  useEffect(() => {
    const accepted = localStorage.getItem(
      "tcg_beta_disclaimer_accepted"
    );
    setBetaAccepted(accepted === "true");

    // IPC listeners
    window.tcg.onGameStatus(setGame);
    window.tcg.onModEvent((e) =>
      setMods((p) => [e, ...p].slice(0, 10))
    );
    window.tcg.onCrashDetected(setCrash);
  }, []);

  // =========================
  // BETA DISCLAIMER HANDLER
  // =========================
  function acceptDisclaimer() {
    localStorage.setItem("tcg_beta_disclaimer_accepted", "true");
    setBetaAccepted(true);
  }

  // =========================
  // RENDER
  // =========================
  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      {/* =========================
          BETA DISCLAIMER MODAL
         ========================= */}
      {!betaAccepted && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 24,
              maxWidth: 520,
              borderRadius: 8
            }}
          >
            <h2>🧪 Beta Version — Please Read</h2>

            <p>
              <strong>TCG Mod & Crash Tracker</strong> is currently in
              <strong> Beta</strong>.
            </p>

            <p>
              This version focuses on <strong>diagnosing crashes</strong>
              and identifying <strong>likely causes related to mods</strong>.
            </p>

            <h4>What this Beta does</h4>
            <ul>
              <li>Detects when the game runs or crashes</li>
              <li>Monitors mod additions, changes, and removals</li>
              <li>Generates readable crash reports</li>
              <li>Identifies likely crash causes</li>
            </ul>

            <h4>What this Beta does <u>not</u> do</h4>
            <ul>
              <li>Does not delete mods</li>
              <li>Does not modify save files</li>
              <li>Does not automatically disable mods</li>
            </ul>

            <p style={{ marginTop: 12 }}>
              This Beta operates in <strong>diagnostic‑only mode</strong>.
              It observes and reports — it does <strong>not</strong> make
              automatic changes.
            </p>

            <label style={{ display: "block", marginTop: 12 }}>
              <input
                type="checkbox"
                checked={disclaimerChecked}
                onChange={(e) =>
                  setDisclaimerChecked(e.target.checked)
                }
              />{" "}
              I understand this is a Beta diagnostic tool and accept
              the limitations above.
            </label>

            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button
                onClick={() => window.close()}
                style={{ marginRight: 8 }}
              >
                Exit App
              </button>
              <button
                disabled={!disclaimerChecked}
                onClick={acceptDisclaimer}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================
          MAIN APPLICATION
         ========================= */}
      <h1>TCG Mod & Crash Tracker</h1>

      <h2>Game Status</h2>
      <p>{game?.running ? "🟢 Game Running" : "🔴 Game Not Running"}</p>

      <h2>Mod Activity</h2>
      <ul>
        {mods.map((m, i) => (
          <li key={i}>{m.message}</li>
        ))}
      </ul>
      {mods.length === 0 && <p>No mod activity detected</p>}

      <h2>Crash Intelligence</h2>
      {crash ? (
        <div style={{ border: "2px solid red", padding: 12 }}>
          <strong>💥 Crash Detected</strong>
          <p>{crash.message}</p>
          <p>{crash.readableTime}</p>

          {crash.analysis?.suspectedMod && (
            <>
              <hr />
              <p><strong>🧠 Likely Cause:</strong></p>
              <p style={{ fontWeight: "bold" }}>
                {crash.analysis.suspectedMod}
              </p>
              <p style={{ color: "#555" }}>
                {crash.analysis.reason}
              </p>
            </>
          )}
        </div>
      ) : (
        <p>No crashes detected</p>
      )}
    </div>
  );
}