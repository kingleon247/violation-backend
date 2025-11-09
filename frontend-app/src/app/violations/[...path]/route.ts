// src/app/violations/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Path to backend data directory
const DATA_ROOT = path.join(
  process.cwd(),
  "..",
  "backend-app",
  "data"
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params;
    
    if (!segments || segments.length === 0) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Join the path segments
    const filePath = path.join(DATA_ROOT, ...segments);

    // Security: Ensure the resolved path is within DATA_ROOT
    const resolvedPath = path.resolve(filePath);
    const resolvedDataRoot = path.resolve(DATA_ROOT);
    
    if (!resolvedPath.startsWith(resolvedDataRoot)) {
      console.error("Path traversal attempt:", resolvedPath);
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      console.error("File not found:", resolvedPath);
      return new NextResponse("File not found", { status: 404 });
    }

    // Check if it's a file (not a directory)
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
      console.error("Not a file:", resolvedPath);
      return new NextResponse("Not a file", { status: 400 });
    }

    // Read the file
    const fileBuffer = fs.readFileSync(resolvedPath);

    // Determine content type based on extension
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".txt": "text/plain",
      ".json": "application/json",
      ".csv": "text/csv",
    };

    const contentType = contentTypes[ext] || "application/octet-stream";

    console.log("Serving file:", resolvedPath, "Type:", contentType);

    // Return the file
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${path.basename(resolvedPath)}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving file:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

