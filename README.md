# cli-web

Run any CLI from the browser. A lightweight web server starts the requested command in a PTY and connects it to a full terminal in your browser.

## Install

```bash
npm install -g cli-web
```

Or run directly with npx:

```bash
npx cli-web aoe
```

## Usage

```bash
# Start aoe on default port 3000
cli-web aoe

# Custom port
PORT=8080 cli-web aoe

# Pass arguments to the CLI
cli-web node --version
```

Then open `http://localhost:3000` in your browser. The page starts the requested CLI automatically.

## Prerequisites

- **Node.js** >= 18
- The CLI you want to run installed and available in your PATH

## How it works

- The landing page opens a full terminal view powered by [ghostty-web](https://github.com/nickolay/ghostty-web)
- The browser connects to the server over WebSocket, which spawns the requested command via a PTY
- Terminal resize, input, and scrollback all work as expected
- Auto-reconnects if the connection drops

## License

MIT
