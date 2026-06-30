import type { WebContainer, WebContainerProcess } from "@webcontainer/api";

export interface RunningProcess {
  process: WebContainerProcess;
  command: string;
}

const activeProcesses = new Map<string, RunningProcess>();

export function trackProcess(key: string, proc: WebContainerProcess, command: string): void {
  const existing = activeProcesses.get(key);
  if (existing) {
    killProcess(existing.process);
  }
  activeProcesses.set(key, { process: proc, command });
}

export function untrackProcess(key: string): void {
  activeProcesses.delete(key);
}

export async function killProcess(proc: WebContainerProcess): Promise<void> {
  try {
    const procAny = proc as any;
    if (typeof procAny.kill === "function") {
      procAny.kill("SIGTERM");
    }
  } catch {}
}

export async function cleanupWebContainer(
  instance: WebContainer
): Promise<void> {
  const entries = Array.from(activeProcesses.entries());

  for (const [key, { process }] of entries) {
    await killProcess(process);
    activeProcesses.delete(key);
  }

  activeProcesses.clear();
}

export async function waitForPortRelease(
  instance: WebContainer,
  port: number,
  timeoutMs: number = 5000
): Promise<boolean> {
  const startTime = Date.now();
  let lastError: string | undefined;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const cmd = await instance.spawn("node", [
        "-e",
        `
        const net = require("net");
        const server = net.createServer();
        server.on("error", (err) => { process.exit(1); });
        server.listen(${port}, () => {
          server.close();
          process.exit(0);
        });
        `,
      ]);

      const exitCode = await cmd.exit;

      if (exitCode === 0) {
        return true;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return false;
}

export async function tryListenOnPort(
  instance: WebContainer,
  port: number,
  timeoutMs: number = 3000
): Promise<boolean> {
  try {
    const cmd = await instance.spawn("node", [
      "-e",
      `
      const net = require("net");
      const server = net.createServer();
      server.listen(${port}, () => {
        server.close();
        process.stdout.write("ok");
      });
      `,
    ]);

    const output = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      const chunks: string[] = [];
      cmd.output.pipeTo(
        new WritableStream({
          write(data) {
            chunks.push(data);
          },
        })
      );
      cmd.exit.then((code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(chunks.join(""));
        else reject(new Error(`exit ${code}`));
      });
    });

    return output.includes("ok");
  } catch {
    return false;
  }
}

export async function verifyServerResponds(
  url: string,
  timeoutMs: number = 5000
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Use no-cors: WebContainer proxy URLs are cross-origin and return neither
    // Access-Control-Allow-Origin nor Cross-Origin-Resource-Policy headers.
    // In a COEP (require-corp) isolated context a cors-mode fetch is always
    // blocked by the browser even when the server is up. With no-cors the
    // response is opaque (type="opaque", status=0) but a non-throwing fetch
    // means the network layer reached the server — which is all we need.
    await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      mode: "no-cors",
    });

    clearTimeout(timeout);
    return true; // opaque response = server accepted the connection
  } catch {
    return false; // TypeError "Failed to fetch" = server not reachable
  }
}
