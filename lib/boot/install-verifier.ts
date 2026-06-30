import type { WebContainer } from "@webcontainer/api";

export interface InstallResult {
  success: boolean;
  checks: {
    nodeModulesExists: boolean;
    nodeModulesNotEmpty: boolean;
    binDirExists: boolean;
    binDirHasEntries: boolean;
    packageJsonModules: number;
    installedModules: number;
    keyPackagePresent: boolean;
    missingKeyPackages: string[];
  };
  reason?: string;
}

async function getDeclaredDeps(instance: WebContainer): Promise<string[]> {
  try {
    const pkgJson = await instance.fs.readFile("/package.json", "utf-8");
    const parsed = JSON.parse(pkgJson);
    return Object.keys({ ...parsed.dependencies, ...parsed.devDependencies });
  } catch {
    return [];
  }
}

async function packageExists(instance: WebContainer, pkg: string): Promise<boolean> {
  try {
    const parts = pkg.split("/");
    const pkgDir = pkg.startsWith("@")
      ? `/node_modules/${parts[0]}/${parts.slice(1).join("/")}`
      : `/node_modules/${parts[0]}`;
    await instance.fs.readFile(`${pkgDir}/package.json`, "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function pathExists(instance: WebContainer, dirPath: string): Promise<boolean> {
  try {
    await instance.fs.readdir(dirPath);
    return true;
  } catch {
    return false;
  }
}

export async function verifyInstall(
  instance: WebContainer,
  _templateId: string
): Promise<InstallResult> {
  const checks = {
    nodeModulesExists: false,
    nodeModulesNotEmpty: false,
    binDirExists: false,
    binDirHasEntries: false,
    packageJsonModules: 0,
    installedModules: 0,
    keyPackagePresent: false,
    missingKeyPackages: [] as string[],
  };

  checks.nodeModulesExists = await pathExists(instance, "/node_modules");
  if (!checks.nodeModulesExists) {
    return { success: false, checks, reason: "node_modules directory not found" };
  }

  try {
    const entries = await instance.fs.readdir("/node_modules");
    checks.installedModules = entries.length;
    checks.nodeModulesNotEmpty = entries.length > 3;

    if (!checks.nodeModulesNotEmpty) {
      return { success: false, checks, reason: "node_modules is nearly empty" };
    }
  } catch {
    return { success: false, checks, reason: "could not read node_modules" };
  }

  checks.binDirExists = await pathExists(instance, "/node_modules/.bin");
  if (checks.binDirExists) {
    try {
      const binEntries = await instance.fs.readdir("/node_modules/.bin");
      checks.binDirHasEntries = binEntries.length > 0;
    } catch {
      checks.binDirHasEntries = false;
    }
  }

  const declaredDeps = await getDeclaredDeps(instance);
  checks.packageJsonModules = declaredDeps.length;

  if (declaredDeps.length === 0) {
    checks.keyPackagePresent = checks.nodeModulesNotEmpty;
    return checks.nodeModulesNotEmpty
      ? { success: true, checks }
      : { success: false, checks, reason: "No dependencies declared and node_modules is empty" };
  }

  // Sample instead of checking every dep: read the first 8 (installed first by
  // npm, most likely to be present or missing) and the last 2 (catch truncated
  // installs). This avoids N sequential async VFS reads for large dep sets.
  const head = declaredDeps.slice(0, 8);
  const tail = declaredDeps.slice(-2).filter((p) => !head.includes(p));
  const sample = [...head, ...tail];

  let foundCount = 0;
  for (const pkg of sample) {
    const exists = await packageExists(instance, pkg);
    if (exists) {
      foundCount++;
    } else {
      checks.missingKeyPackages.push(pkg);
    }
  }

  checks.keyPackagePresent = foundCount > 0;

  if (checks.missingKeyPackages.length > 0) {
    return {
      success: false,
      checks,
      reason: `Missing packages: ${checks.missingKeyPackages.join(", ")}`,
    };
  }

  return { success: true, checks };
}

export async function checkIntegrity(
  instance: WebContainer,
  _templateId: string
): Promise<{ pass: boolean; issues: string[] }> {
  const issues: string[] = [];

  const declaredDeps = await getDeclaredDeps(instance);
  if (declaredDeps.length === 0) {
    return { pass: true, issues: [] };
  }

  const sampleSize = Math.min(declaredDeps.length, 5);
  const sample = declaredDeps.slice(0, sampleSize);

  for (const pkg of sample) {
    try {
      const parts = pkg.split("/");
      const pkgDir = pkg.startsWith("@")
        ? `/node_modules/${parts[0]}/${parts.slice(1).join("/")}`
        : `/node_modules/${parts[0]}`;

      const pkgJsonRaw = await instance.fs.readFile(
        `${pkgDir}/package.json`,
        "utf-8"
      );
      const pkgJson = JSON.parse(pkgJsonRaw);

      if (!pkgJson.version) {
        issues.push(`${pkg}: missing version field`);
      }

      const mainFile =
        pkgJson.main ||
        pkgJson.module ||
        pkgJson.exports?.["."]?.import ||
        pkgJson.exports?.["."]?.default;
      if (mainFile) {
        try {
          const resolvedMain = typeof mainFile === "string" ? mainFile : "";
          if (resolvedMain) {
            await instance.fs.readFile(
              `${pkgDir}/${resolvedMain}`,
              "utf-8"
            );
          }
        } catch {
          issues.push(`${pkg}: main entry ${mainFile} not found`);
        }
      }
    } catch {
      issues.push(`${pkg}: package.json not found`);
    }
  }

  return { pass: issues.length === 0, issues };
}

export async function checkForPartialInstall(
  instance: WebContainer
): Promise<boolean> {
  try {
    const entries = await instance.fs.readdir("/node_modules");
    if (entries.length < 5) return true;

    const binExists = await pathExists(instance, "/node_modules/.bin");
    if (!binExists) return true;

    return false;
  } catch {
    return true;
  }
}

export async function listInstalledPackages(
  instance: WebContainer
): Promise<string[]> {
  try {
    const entries = await instance.fs.readdir("/node_modules");

    const packages: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      if (entry.startsWith("@")) {
        try {
          const scopedEntries = await instance.fs.readdir(
            `/node_modules/${entry}`
          );
          for (const scoped of scopedEntries) {
            packages.push(`${entry}/${scoped}`);
          }
        } catch {
          packages.push(entry);
        }
      } else {
        packages.push(entry);
      }
    }

    return packages;
  } catch {
    return [];
  }
}
