/**
 * WebContainer singleton — ensures WebContainer.boot() is called at most once
 * per browser session, regardless of how many components import this module.
 */
import { WebContainer } from "@webcontainer/api";

let instance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

export function getWebContainer(): Promise<WebContainer> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("WebContainer can only be used in the browser")
    );
  }

  // Already booted — return immediately
  if (instance) return Promise.resolve(instance);

  // Boot already in progress — return the same promise
  if (bootPromise) return bootPromise;

  bootPromise = WebContainer.boot()
    .then((wc) => {
      instance = wc;
      return wc;
    })
    .catch((err) => {
      // Reset so it can be retried on next call
      bootPromise = null;
      throw err;
    });

  return bootPromise;
}

/**
 * Call this as early as possible (e.g. in the dashboard layout) to warm up
 * the WebContainer before the user navigates to a playground.
 * Fire-and-forget — errors are intentionally swallowed here.
 */
export function prebootWebContainer(): void {
  if (typeof window === "undefined") return;
  getWebContainer().catch(() => {
    // silently ignore — will retry when playground actually opens
  });
}
