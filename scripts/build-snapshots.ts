import { execSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

interface SnapshotConfig {
  template: string;
  dir: string;
}

interface BuildResult {
  template: string;
  hash: string;
  compressedSize: number;
  uncompressedSize: number;
  fileCount: number;
  durationMs: number;
}

const TEMPLATES: SnapshotConfig[] = [
  { template: "react-vite", dir: "vibecode-starters/react-ts" },
  { template: "nextjs", dir: "vibecode-starters/nextjs" },
  { template: "vue", dir: "vibecode-starters/vue" },
  // Note: svelte, vanilla, and astro template IDs don't have matching directories.
  // "vanilla" is used as a catch-all for express-simple, hono-nodejs-starter, and angular
  // which have different dependency sets — each needs its own TemplateId in the future.
];

const OUTPUT_DIR = resolve(process.cwd(), "snapshots");

const STRIP_PATTERNS = [
  "**/*.md",
  "**/*.markdown",
  "**/CHANGELOG*",
  "**/CHANGE_LOG*",
  "**/LICENSE*",
  "**/LICENCE*",
  "**/AUTHORS*",
  "**/CONTRIBUTING*",
  "**/CODE_OF_CONDUCT*",
  "**/Security*",
  "**/test/**",
  "**/tests/**",
  "**/__tests__/**",
  "**/*.test.js",
  "**/*.test.ts",
  "**/*.spec.js",
  "**/*.spec.ts",
  "**/.github/**",
  "**/docs/**",
  "**/doc/**",
  "**/man/**",
  "**/examples/**",
  "**/example/**",
  "**/coverage/**",
  "**/.nyc_output/**",
  "**/this.prop",
  "**/package-lock.json",
];

function countFiles(dir: string): number {
  let count = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        count += countFiles(fullPath);
      } else if (entry.isFile()) {
        count++;
      }
    }
  } catch {}
  return count;
}

function computeDirectorySize(dir: string): number {
  let total = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += computeDirectorySize(fullPath);
      } else if (entry.isFile()) {
        total += statSync(fullPath).size;
      }
    }
  } catch {}
  return total;
}

function buildSnapshot(config: SnapshotConfig): BuildResult {
  const startTime = Date.now();
  const templateDir = resolve(process.cwd(), config.dir);
  const templateName = config.template;

  console.log(`\n=== Building snapshot for ${templateName} ===`);

  if (!existsSync(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }

  console.log(`  Installing dependencies in ${templateDir}...`);

  execSync("npm install --no-audit --no-fund --ignore-scripts", {
    cwd: templateDir,
    stdio: "pipe",
    timeout: 300_000,
  });

  const nodeModulesDir = join(templateDir, "node_modules");
  if (!existsSync(nodeModulesDir)) {
    throw new Error(`node_modules not created at ${nodeModulesDir}`);
  }

  const fileCount = countFiles(nodeModulesDir);
  const uncompressedSize = computeDirectorySize(nodeModulesDir);

  console.log(`  Found ${fileCount} files, ${(uncompressedSize / 1_000_000).toFixed(1)} MB unpacked`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const tarPath = join(OUTPUT_DIR, `${templateName}.tar`);
  const gzPath = join(OUTPUT_DIR, `${templateName}.tar.gz`);

  const stripArgs = STRIP_PATTERNS.map((p) => `--exclude="${p}"`).join(" ");

  console.log(`  Creating tarball...`);

  execSync(
    `tar -cf "${tarPath}" ${stripArgs} -C "${templateDir}" node_modules`,
    { stdio: "pipe", timeout: 120_000 }
  );

  console.log(`  Compressing with gzip...`);

  execSync(`gzip -f -9 "${tarPath}"`, { stdio: "pipe", timeout: 120_000 });

  const compressedSize = statSync(gzPath).size;

  const hash = createHash("sha256")
    .update(readFileSync(gzPath))
    .digest("hex")
    .slice(0, 16);

  const hashedPath = join(OUTPUT_DIR, `${templateName}-${hash}.tar.gz`);
  execSync(`move "${gzPath}" "${hashedPath}"`, { stdio: "pipe" });

  const durationMs = Date.now() - startTime;

  console.log(`  Done: ${(compressedSize / 1_000_000).toFixed(1)} MB compressed`);
  console.log(`  Hash: ${hash}`);
  console.log(`  Duration: ${(durationMs / 1000).toFixed(1)}s`);

  return {
    template: templateName,
    hash,
    compressedSize,
    uncompressedSize,
    fileCount,
    durationMs,
  };
}

interface ManifestEntry {
  template: string;
  hash: string;
  compressedSizeBytes: number;
  uncompressedSizeBytes: number;
  fileCount: number;
  buildDurationMs: number;
  nodeVersion: string;
  npmVersion: string;
  createdAt: string;
  expiresAt: string;
}

async function buildAll(): Promise<void> {
  console.log("DevPilot Snapshot Builder");
  console.log("========================\n");

  const results: BuildResult[] = [];

  for (const config of TEMPLATES) {
    try {
      const result = buildSnapshot(config);
      results.push(result);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const nodeVersion = execSync("node --version").toString().trim();
  const npmVersion = execSync("npm --version").toString().trim();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();

  const manifest: ManifestEntry[] = results.map((r) => ({
    template: r.template,
    hash: r.hash,
    compressedSizeBytes: r.compressedSize,
    uncompressedSizeBytes: r.uncompressedSize,
    fileCount: r.fileCount,
    buildDurationMs: r.durationMs,
    nodeVersion,
    npmVersion,
    createdAt: now,
    expiresAt: expires,
  }));

  writeFileSync(
    join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log("\n=== Summary ===");
  console.log(`Total templates built: ${results.length}`);
  console.log(`Total snapshots: ${results.length}`);
  console.log(`Total compressed: ${(results.reduce((a, r) => a + r.compressedSize, 0) / 1_000_000).toFixed(1)} MB`);
  console.log(`Total uncompressed: ${(results.reduce((a, r) => a + r.uncompressedSize, 0) / 1_000_000).toFixed(1)} MB`);
  console.log(`Output directory: ${OUTPUT_DIR}`);

  const uploadCommands = manifest.map(
    (m) =>
      `aws s3 cp "${OUTPUT_DIR}/${m.template}-${m.hash}.tar.gz" "s3://devpilot-snapshots/${m.template}/${m.hash}.tar.gz" --cache-control "public, max-age=31536000, immutable"`
  );

  console.log("\n=== Upload Commands ===");
  uploadCommands.forEach((cmd) => console.log(cmd));

  const hashUpdates = manifest.map(
    (m) => `  "${m.template}": "${m.hash}",`
  );

  console.log("\n=== Template Hash Updates (copy to config.ts) ===");
  hashUpdates.forEach((line) => console.log(line));

  console.log("\nDone.");
}

buildAll().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
