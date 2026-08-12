# PC Remote Companion

Control **your** PC from your phone on the same Wi‑Fi network.

This is a small companion app you run on the PC. Your phone opens a web page and can:

- See if the PC is online
- Send an on-screen alert
- Open a link on the PC
- Lock the PC
- Put the PC to sleep

It does **not** give arbitrary shell access. Only those actions are allowed, and every request needs an access token.

## Requirements

- Node.js 18+
- Phone and PC on the same Wi‑Fi
- Windows, macOS, or Linux

## Setup on your PC

```bash
cd pc-remote
npm start
```

The terminal prints:

1. An **access token**
2. A **Phone URL** like `http://192.168.x.x:8787/?token=...`

Open that URL on your phone. Keep the terminal window open while you want remote control.

## Notes

- Token is stored in `pc-remote/.data/token.txt`
- Default port is `8787` (override with `PC_REMOTE_PORT`)
- This only works on your local network unless you add your own secure tunnel
- Windows firewall may ask to allow Node the first time — allow private networks

## Security

- Anyone with the token and network access can use the controls
- Do not share the token URL
- Stop the server when you are done (`Ctrl+C`)
