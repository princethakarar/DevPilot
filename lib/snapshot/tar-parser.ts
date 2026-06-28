export interface TarEntry {
  name: string;
  type: "file" | "directory" | "symlink";
  size: number;
  mode: number;
  uid: number;
  gid: number;
  mtime: number;
  linkname: string;
  data: Uint8Array | null;
}

const HEADER_SIZE = 512;
const BLOCK_SIZE = 512;

function parseOctal(str: string): number {
  return parseInt(str.replace(/\0/g, "").trim(), 8) || 0;
}

function readString(buf: Uint8Array, offset: number, length: number): string {
  const end = buf.indexOf(0, offset);
  const actualEnd = end >= 0 && end < offset + length ? end : offset + length;
  return new TextDecoder("utf-8").decode(buf.slice(offset, actualEnd));
}

function parseHeader(buf: Uint8Array): TarEntry | null {
  if (buf[0] === 0) return null;

  const name = readString(buf, 0, 100);
  if (!name) return null;

  const mode = parseOctal(readString(buf, 100, 8));
  const uid = parseOctal(readString(buf, 108, 8));
  const gid = parseOctal(readString(buf, 116, 8));
  const size = parseOctal(readString(buf, 124, 12));
  const mtime = parseOctal(readString(buf, 136, 12));
  const typeflag = String.fromCharCode(buf[156]);
  const linkname = readString(buf, 157, 100);
  const prefix = readString(buf, 345, 155);

  const fullName = prefix ? `${prefix}/${name}` : name;
  let normalizedName = fullName;
  if (normalizedName.startsWith("./")) {
    normalizedName = normalizedName.slice(2);
  }

  let type: TarEntry["type"] = "file";
  if (typeflag === "5") type = "directory";
  else if (typeflag === "2") type = "symlink";

  return {
    name: normalizedName,
    type,
    size,
    mode,
    uid,
    gid,
    mtime,
    linkname,
    data: type === "file" && size > 0 ? null : null,
  };
}

interface ExtractCallbacks {
  onFile?: (entry: TarEntry, data: Uint8Array) => Promise<void> | void;
  onDirectory?: (entry: TarEntry) => Promise<void> | void;
  onSymlink?: (entry: TarEntry) => Promise<void> | void;
  onProgress?: (extracted: number, total: number) => void;
}

export async function extractTar(
  buffer: Uint8Array,
  callbacks: ExtractCallbacks,
  totalFiles?: number
): Promise<void> {
  let offset = 0;
  let fileIndex = 0;

  while (offset + HEADER_SIZE <= buffer.length) {
    const headerBuf = buffer.slice(offset, offset + HEADER_SIZE);
    const entry = parseHeader(headerBuf);

    if (!entry) {
      offset += HEADER_SIZE;
      continue;
    }

    offset += HEADER_SIZE;

    if (entry.name === "") break;

    const dataSize = Math.ceil(entry.size / BLOCK_SIZE) * BLOCK_SIZE;
    const dataBuf = offset + dataSize <= buffer.length
      ? buffer.slice(offset, offset + dataSize)
      : new Uint8Array(0);

    if (entry.type === "file") {
      const fileData = dataBuf.slice(0, entry.size);
      entry.data = fileData;
      await callbacks.onFile?.(entry, fileData);
    } else if (entry.type === "directory") {
      await callbacks.onDirectory?.(entry);
    } else if (entry.type === "symlink") {
      await callbacks.onSymlink?.(entry);
    }

    fileIndex++;
    callbacks.onProgress?.(fileIndex, totalFiles ?? fileIndex);
    offset += dataSize;

    if (offset > buffer.length) break;
  }
}

export function buildFileSystemTree(
  buffer: Uint8Array,
  rootPath: string = "node_modules"
): Record<string, any> {
  const tree: Record<string, any> = {};

  let offset = 0;
  while (offset + HEADER_SIZE <= buffer.length) {
    const headerBuf = buffer.slice(offset, offset + HEADER_SIZE);
    if (headerBuf[0] === 0) break;

    const name = readString(headerBuf, 0, 100);
    if (!name) break;

    const size = parseOctal(readString(headerBuf, 124, 12));
    const typeflag = String.fromCharCode(headerBuf[156]);
    const prefix = readString(headerBuf, 345, 155);

    offset += HEADER_SIZE;
    const dataSize = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;

    const fullName = prefix ? `${prefix}/${name}` : name;
    const normalized = fullName.startsWith("./") ? fullName.slice(2) : fullName;

    if (!normalized.startsWith(rootPath)) {
      offset += dataSize;
      continue;
    }

    const relativePath = normalized.slice(rootPath.length).replace(/^\/+/, "");
    if (!relativePath) {
      offset += dataSize;
      continue;
    }

    const parts = relativePath.split("/");
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (typeflag === "5" || !isLast) {
        if (!current[part]) current[part] = { directory: {} };
        if (!current[part].directory) current[part] = { directory: {} };
        current = current[part].directory;
      } else if (typeflag === "0" || typeflag === "") {
        const fileData = buffer.slice(offset, offset + Math.min(size, dataSize));
        current[part] = { file: { contents: new Uint8Array(fileData) } };
      }
    }

    offset += dataSize;
    if (offset > buffer.length) break;
  }

  return tree;
}
