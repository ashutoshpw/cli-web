#!/usr/bin/env node
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import { renderTerminal } from "./frontend.js";

type ClientMessage =
	| { type: "input"; data: string }
	| { type: "resize"; cols: number; rows: number };

const activePtys = new Set<pty.IPty>();

const rawArgs = process.argv.slice(2);
let appName = "cli";
const filteredArgs: string[] = [];
for (let i = 0; i < rawArgs.length; i++) {
	if (rawArgs[i] === "--name" && i + 1 < rawArgs.length) {
		appName = rawArgs[++i];
	} else {
		filteredArgs.push(rawArgs[i]);
	}
}

const commandArgs = filteredArgs;
const command = commandArgs[0];
const commandDisplay = commandArgs.length > 0 ? commandArgs.join(" ") : "";

const app = new Hono();

app.get("/", (c) => {
	return c.html(renderTerminal(commandDisplay, appName));
});

app.get("/manifest.webmanifest", (_c) => {
	return new Response(
		JSON.stringify({
			name: appName,
			short_name: appName,
			display: "standalone",
			start_url: "/",
			background_color: "#111111",
			theme_color: "#11161d",
			icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
		}),
		{ headers: { "Content-Type": "application/manifest+json" } },
	);
});

app.get("/icon.svg", (_c) => {
	const escaped = appName.slice(0, 2).toUpperCase();
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="32" fill="#11161d"/><text x="96" y="125" font-family="monospace" font-size="72" font-weight="bold" fill="#73c991" text-anchor="middle">${escaped}</text></svg>`;
	return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
});

const port = parseInt(process.env.PORT || "3000", 10);

const server = serve({ fetch: app.fetch, port }, (info) => {
	console.log(`cli-web running at http://localhost:${info.port}`);
	if (!command) {
		console.log("No CLI command provided. Usage: cli-web <command> [...args]");
	} else {
		console.log(`Running: ${commandDisplay}`);
	}
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
	const url = new URL(req.url || "/", `http://${req.headers.host}`);
	if (url.pathname !== "/ws") {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(req, socket, head, (ws) => {
		wss.emit("connection", ws, req);
	});
});

wss.on("connection", (ws: WebSocket) => {
	let ptyProcess: pty.IPty | null = null;

	if (!command) {
		ws.send("\r\n\x1b[31mNo CLI command provided. Usage: cli-web <command> [...args]\x1b[0m\r\n");
		ws.close(1008, "missing command");
		return;
	}

	try {
		ptyProcess = pty.spawn(command, commandArgs.slice(1), {
			name: "xterm-256color",
			cols: 80,
			rows: 24,
			cwd: process.env.HOME || "/",
			env: process.env as Record<string, string>,
		});
	} catch (err: any) {
		ws.send(
			`\r\n\x1b[31mFailed to start ${commandDisplay}: ${err.message}\x1b[0m\r\n`,
		);
		ws.close(1011, "pty spawn failed");
		return;
	}

	activePtys.add(ptyProcess);

	ptyProcess.onData((data: string) => {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(data);
		}
	});

	ptyProcess.onExit(({ exitCode }) => {
		if (ptyProcess) activePtys.delete(ptyProcess);
		ptyProcess = null;
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(
				`\r\n\x1b[2m--- ${commandDisplay} exited (code ${exitCode}) ---\x1b[0m\r\n`,
			);
			ws.close(1000, "pty exited");
		}
	});

	ws.on("message", (raw) => {
		if (!ptyProcess) return;
		const data = typeof raw === "string" ? raw : raw.toString("utf-8");

		let msg: ClientMessage;
		try {
			msg = JSON.parse(data);
		} catch {
			return;
		}

		if (msg.type === "input" && typeof msg.data === "string") {
			ptyProcess.write(msg.data);
		} else if (
			msg.type === "resize" &&
			typeof msg.cols === "number" &&
			typeof msg.rows === "number"
		) {
			ptyProcess.resize(Math.max(10, msg.cols), Math.max(5, msg.rows));
		}
	});

	ws.on("close", () => {
		if (ptyProcess) {
			activePtys.delete(ptyProcess);
			ptyProcess.kill();
			ptyProcess = null;
		}
	});

	ws.on("error", () => {
		if (ptyProcess) {
			activePtys.delete(ptyProcess);
			ptyProcess.kill();
			ptyProcess = null;
		}
	});
});

function cleanup() {
	for (const p of activePtys) {
		try {
			p.kill();
		} catch {}
	}
	activePtys.clear();
	process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
