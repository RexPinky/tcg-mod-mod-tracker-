# Changelog

## 0.6.0 — Game 1.0 Compatibility

Supports **TCG Card Shop Simulator 1.0 / 1.01 / 1.02** (September 2026 full release).

### Changes
- Auto-detect Steam library install for app `3070070` instead of a hardcoded `E:\SteamLibrary` path
- Allow override via `TCG_GAME_PATH` or `config.json` `gamePath`
- Show detected install/build info in the UI
- Watch `BepInEx/LogOutput.log` for exception/fatal signals
- Score expansion / texture / card-art mods higher after 1.0 content changes
- Watch MelonLoader `Mods` folder when present
- Lift Phase 5 code freeze for this compatibility release (still diagnostic-only)

### Player checklist after updating the game
1. Update the game to 1.0+
2. Reinstall BepInEx 5.4.23.2 into the game root
3. Update or remove mods built for Early Access 0.70.x
4. Launch the tracker and confirm the Install panel finds your game folder

## 0.5.0-beta — Phase 5 Diagnostic Beta

Initial diagnostic tracker with crash intelligence (rule-based).
