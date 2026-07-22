import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest } from "next/server";
import { currentUser } from "@/modules/auth/actions";
import { isExpired } from "@/lib/dependency-cache-ttl";

// Level 2 (Blob) dependency cache — mints a short-lived, pathname-scoped
// upload token so the browser can PUT a node_modules bundle (tens of MB)
// straight to Blob storage without the bytes passing through this function's
// body (well over the ~4.5MB serverless payload limit otherwise). This route
// never sees the bundle bytes, only the pathname.
const BLOB_PATHNAME_RE = /^node-modules\/[a-f0-9]{64}\.bin$/;

// Bundle encoding, mirrored read-only from node-modules-persistence.ts's
// encodeBundleForBlob: [4-byte LE header length][JSON header incl. cachedAt][payload].
// Only the header is ever fetched here (via Range requests), never the
// multi-MB/GB compressed payload that follows it.
const BLOB_BASE_URL = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
// Real captured headers run into the low single-digit MB for the heaviest
// templates (one observed live entry: ~1.8MB for ~22k files) — this just
// bounds the Range request against a pathologically large/corrupt value.
const MAX_HEADER_BYTES = 20 * 1024 * 1024;

/**
 * Decides whether a write to `pathname` may proceed, based on the freshness
 * of whatever is already there — not on whether it has content at all. A
 * blanket "reject if anything exists" rule would break the legitimate 7-day
 * refresh this cache depends on; a blanket "allow if content exists" rule is
 * exactly the unauthenticated-overwrite hole this route existed with. So:
 *   - nothing at this pathname yet -> allow (first write for this hash)
 *   - existing entry, still within MAX_AGE_MS -> reject (actively-served, trusted)
 *   - existing entry, past MAX_AGE_MS -> allow (legitimate refresh)
 *   - existing entry, but its state can't be verified (network error,
 *     unparseable header, missing base URL) -> reject. This check exists
 *     purely to prevent overwriting a live cache entry, so an inability to
 *     confirm "it's actually expired" must fail closed, unlike the rest of
 *     this cache's normal fail-open behavior on Blob errors.
 */
async function existingEntryAllowsWrite(pathname: string): Promise<{ allow: boolean; reason: string }> {
  if (!BLOB_BASE_URL) {
    return { allow: false, reason: "Blob base URL not configured — cannot verify existing entry" };
  }

  const url = `${BLOB_BASE_URL}/${pathname}`;

  let lenRes: Response;
  try {
    lenRes = await fetch(url, { headers: { Range: "bytes=0-3" } });
  } catch {
    return { allow: false, reason: "Network error checking existing entry" };
  }

  if (lenRes.status === 404) {
    return { allow: true, reason: "No existing entry at this pathname" };
  }
  if (lenRes.status !== 200 && lenRes.status !== 206) {
    return { allow: false, reason: `Unexpected status ${lenRes.status} checking existing entry` };
  }

  const lenBytes = new Uint8Array(await lenRes.arrayBuffer());
  if (lenBytes.byteLength < 4) {
    return { allow: false, reason: "Existing entry too short to contain a valid header" };
  }
  const headerLen = new DataView(lenBytes.buffer, lenBytes.byteOffset, 4).getUint32(0, true);
  if (headerLen <= 0 || headerLen > MAX_HEADER_BYTES) {
    return { allow: false, reason: "Existing entry has an implausible header length" };
  }

  let headerRes: Response;
  try {
    headerRes = await fetch(url, { headers: { Range: `bytes=4-${3 + headerLen}` } });
  } catch {
    return { allow: false, reason: "Network error reading existing entry header" };
  }
  if (headerRes.status !== 200 && headerRes.status !== 206) {
    return { allow: false, reason: `Unexpected status ${headerRes.status} reading existing entry header` };
  }

  let cachedAt: unknown;
  try {
    const headerBytes = new Uint8Array(await headerRes.arrayBuffer());
    const header = JSON.parse(new TextDecoder().decode(headerBytes));
    cachedAt = header.cachedAt;
  } catch {
    return { allow: false, reason: "Existing entry header is not valid JSON" };
  }
  if (typeof cachedAt !== "number" || !Number.isFinite(cachedAt)) {
    return { allow: false, reason: "Existing entry header has no valid cachedAt" };
  }

  if (isExpired(cachedAt)) {
    return { allow: true, reason: "Existing entry is past MAX_AGE_MS" };
  }
  return { allow: false, reason: "Existing entry is still within MAX_AGE_MS" };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Floor, not the whole fix: this stops an anonymous caller from ever
        // reaching this route at all. An authenticated user can still craft
        // a package.json colliding with a known template's hash — see (2)
        // below and the report this fix responds to for the residual gap.
        const user = await currentUser();
        if (!user?.id) {
          throw new Error("Not authenticated");
        }

        if (!BLOB_PATHNAME_RE.test(pathname)) {
          throw new Error("Invalid dependency cache pathname");
        }

        const { allow, reason } = await existingEntryAllowsWrite(pathname);
        if (!allow) {
          throw new Error(`Write rejected: ${reason}`);
        }

        return {
          allowedContentTypes: ["application/octet-stream"],
          addRandomSuffix: false,
          allowOverwrite: true,
          maximumSizeInBytes: 300 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {
        // No server-side bookkeeping needed — the pathname IS the cache key.
      },
    });

    return Response.json(jsonResponse);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload token generation failed" },
      { status: 400 }
    );
  }
}

/**
 * RESIDUAL RISK (not fixed by this file, documented deliberately):
 * This closes the ability to silently overwrite an actively-serving, trusted
 * cache entry — the severe part of what was found (any anonymous caller could
 * overwrite any of the 41 templates' live cache at will). It does NOT fully
 * guarantee content integrity:
 *   - An attacker who authenticates normally and is first to populate a
 *     brand-new, never-before-seen hash still controls that slot's initial
 *     content — nothing here verifies the uploaded bytes actually correspond
 *     to a legitimate node_modules capture for that package.json.
 *   - An attacker who wins the narrow race immediately after a real entry
 *     expires can still win the next write for that pathname.
 * Both are real, smaller gaps than the one this fixes (unauthenticated,
 * on-demand overwrite of any live entry) and are left open, not papered over.
 */
