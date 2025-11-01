import path from "node:path";
export const REPO_ROOT = path.resolve(process.cwd(), "..");
export const PY_ROOT = path.join(REPO_ROOT, "backend-app");
export const DATA_ROOT = path.join(PY_ROOT, "data");
export const PY_SCRIPT = path.join(PY_ROOT, "baltimore_violations_scraper.py");
