"use strict";

// Minimal, safe bridge. contextIsolation is on; we expose only a tiny read-only
// surface. The frontend talks to the backend over HTTP (same-origin /api/*
// proxied by the SSR server), so no privileged IPC is required here.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hermesDesktop", {
  isDesktop: true,
  platform: process.platform,
  // Settings page calls this after saving a custom API/model so the FastClaw
  // gateway restarts and reloads its configs. Resolves to { ok: boolean }.
  restartFastclaw: () => ipcRenderer.invoke("fastclaw:restart"),
});
