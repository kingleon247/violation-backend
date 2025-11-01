// src/lib/python.ts
import path from "path";
import fs from "fs";

export function getBackendPaths() {
  // repo root is the parent of frontend-app
  // If your frontend runs from /next-scraper/frontend-app, process.cwd() is that dir.
  // Walk up until we find backend-app.
  let cwd = process.cwd();
  // In case this file is imported from anywhere inside frontend-app/*:
  const parts = cwd.split(path.sep);
  const idx = parts.lastIndexOf("frontend-app");
  const repoRoot = idx >= 0 ? parts.slice(0, idx).join(path.sep) : cwd;

  const backend = path.join(repoRoot, "backend-app");
  const win = process.platform === "win32";
  const venvPy = path.join(
    backend,
    ".venv",
    win ? "Scripts" : "bin",
    win ? "python.exe" : "python"
  );
  const script = path.join(backend, "baltimore_violations_scraper.py");
  const dataDir = path.join(backend, "data");

  if (!fs.existsSync(script)) {
    throw new Error(`Scraper not found at: ${script}`);
  }
  if (!fs.existsSync(venvPy)) {
    throw new Error(
      `Python venv not found at: ${venvPy}  (Did you create/activate it and install deps?)`
    );
  }
  return { backend, venvPy, script, dataDir };
}
