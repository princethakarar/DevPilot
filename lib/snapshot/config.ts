import type { TemplateId, TemplateDependencyProfile } from "./types";

export const SNAPSHOT_CDN_BASE = "https://snapshots.devpilot.app";

export const TEMPLATE_SNAPSHOT_HASHES: Record<TemplateId, string> = {
  "react-vite": "",
  nextjs: "",
  vue: "",
  svelte: "",
  vanilla: "",
  astro: "",
};

export const TEMPLATE_DEPENDENCY_PROFILES: Record<TemplateId, TemplateDependencyProfile> = {
  "react-vite": {
    template: "react-vite",
    totalDeps: 240,
    nodeModulesSize: 85_000_000,
    compressedSize: 18_000_000,
    installTime: "medium",
    hasNativeBinaries: false,
    estimatedSnapshotLoadMs: 2500,
  },
  nextjs: {
    template: "nextjs",
    totalDeps: 680,
    nodeModulesSize: 320_000_000,
    compressedSize: 65_000_000,
    installTime: "very-slow",
    hasNativeBinaries: true,
    estimatedSnapshotLoadMs: 6000,
  },
  vue: {
    template: "vue",
    totalDeps: 160,
    nodeModulesSize: 55_000_000,
    compressedSize: 12_000_000,
    installTime: "medium",
    hasNativeBinaries: false,
    estimatedSnapshotLoadMs: 2000,
  },
  svelte: {
    template: "svelte",
    totalDeps: 180,
    nodeModulesSize: 60_000_000,
    compressedSize: 13_000_000,
    installTime: "medium",
    hasNativeBinaries: false,
    estimatedSnapshotLoadMs: 2200,
  },
  vanilla: {
    template: "vanilla",
    totalDeps: 20,
    nodeModulesSize: 8_000_000,
    compressedSize: 2_000_000,
    installTime: "fast",
    hasNativeBinaries: false,
    estimatedSnapshotLoadMs: 800,
  },
  astro: {
    template: "astro",
    totalDeps: 310,
    nodeModulesSize: 120_000_000,
    compressedSize: 28_000_000,
    installTime: "slow",
    hasNativeBinaries: false,
    estimatedSnapshotLoadMs: 3500,
  },
};

export const EXTRACT_SCRIPT = `
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const SNAPSHOT_PATH = process.argv[2];
const TARGET = process.argv[3] || "/";

async function extract() {
  const compressed = fs.readFileSync(SNAPSHOT_PATH);
  const decompressed = await new Promise((resolve, reject) => {
    zlib.gunzip(compressed, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });

  let offset = 0;
  let count = 0;
  const HEADER_SIZE = 512;
  const BLOCK_SIZE = 512;

  while (offset + HEADER_SIZE <= decompressed.length) {
    const header = decompressed.slice(offset, offset + HEADER_SIZE);
    if (header[0] === 0) break;

    const nameBuf = [];
    for (let i = 0; i < 100 && header[i] !== 0; i++) nameBuf.push(header[i]);
    const name = Buffer.from(nameBuf).toString("utf8");
    if (!name) { offset += HEADER_SIZE; continue; }

    const sizeStr = header.toString("utf8", 124, 136).replace(/\\0/g, "").trim();
    const size = parseInt(sizeStr, 8) || 0;
    const typeflag = String.fromCharCode(header[156]);
    const prefixBuf = [];
    for (let i = 345; i < 500 && header[i] !== 0; i++) prefixBuf.push(header[i]);
    const prefix = Buffer.from(prefixBuf).toString("utf8");

    offset += HEADER_SIZE;
    const paddedSize = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
    const fullName = prefix ? path.join(prefix, name) : name;
    const targetPath = path.join(TARGET, fullName);

    if (typeflag === "5") {
      fs.mkdirSync(targetPath, { recursive: true });
    } else if (typeflag === "0" || typeflag === "") {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, decompressed.slice(offset, offset + size));
      count++;
    } else if (typeflag === "2") {
      // symlink — skip in WebContainer
    }

    offset += paddedSize;
    if (count % 500 === 0) process.stdout.write(JSON.stringify({ extracted: count }) + "\\n");
  }

  process.stdout.write(JSON.stringify({ done: true, total: count }) + "\\n");
}

extract().catch((err) => {
  process.stderr.write(err.message + "\\n");
  process.exit(1);
});
`.trim();
