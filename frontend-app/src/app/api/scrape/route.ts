// src/app/api/scrape/route.ts
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { getBackendPaths } from "@/lib/python";

type Body = {
  neighborhoods?: string[];
  all?: boolean;
  since?: string | null;
  extract?: boolean;
  ocr?: boolean;
  maxPdfsPerNeighborhood?: number | null;
  headed?: boolean;
  slowMo?: number | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const {
      neighborhoods = [],
      all = false,
      since = null,
      extract = false,
      ocr = false,
      maxPdfsPerNeighborhood = null,
      headed = false,
      slowMo = null,
    } = body;

    const { backend, venvPy, script, dataDir } = getBackendPaths();

    const args: string[] = [script];
    if (all) {
      args.push("--all");
    } else if (neighborhoods.length) {
      args.push("--neighborhoods", ...neighborhoods);
    } else {
      return NextResponse.json(
        { ok: false, error: "Provide --all or neighborhoods[]" },
        { status: 400 }
      );
    }

    args.push("--out", dataDir);
    if (since) args.push("--since", since);
    if (extract) args.push("--extract");
    if (ocr) args.push("--ocr");
    if (maxPdfsPerNeighborhood != null) {
      args.push("--max-pdfs-per-neighborhood", String(maxPdfsPerNeighborhood));
    }
    if (headed) args.push("--headed");
    if (slowMo != null) {
      args.push("--slow-mo", String(slowMo));
    }

    const child = spawn(venvPy, args, {
      cwd: backend,
      env: { ...process.env }, // inherits PATH, TESSDATA_PREFIX, etc.
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    const exitCode: number = await new Promise((resolve) => {
      child.on("close", resolve);
    });

    const ok = exitCode === 0;
    return NextResponse.json({
      ok,
      exitCode,
      stdout,
      stderr,
      cmd: [venvPy, ...args],
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
