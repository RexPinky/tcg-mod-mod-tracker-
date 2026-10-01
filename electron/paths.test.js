"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveGameInstall, GAME_FOLDER_NAME } = require("./paths");

test("resolveGameInstall reports missing install cleanly", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tcg-tracker-"));
  const result = resolveGameInstall(tmp);
  assert.equal(result.ok, false);
  assert.equal(result.source, "none");
  assert.match(result.configPath, /config\.json$/);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.length > 0);
});

test("resolveGameInstall respects config gamePath override", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tcg-tracker-"));
  const fakeGame = path.join(tmp, "fake-game");
  fs.mkdirSync(path.join(fakeGame, "BepInEx", "plugins"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, "config.json"),
    JSON.stringify({ gamePath: fakeGame }),
    "utf8"
  );

  const result = resolveGameInstall(tmp);
  assert.equal(result.ok, true);
  assert.equal(result.source, "config");
  assert.equal(result.gamePath, fakeGame);
  assert.equal(result.modsDir, path.join(fakeGame, "BepInEx", "plugins"));
  assert.equal(GAME_FOLDER_NAME, "TCG Card Shop Simulator");
});
