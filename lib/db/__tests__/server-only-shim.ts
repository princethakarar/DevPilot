// Vitest runs under plain Node, not Next.js's webpack build, so the real
// `server-only` package (which unconditionally throws unless the bundler
// aliases it away for server contexts) would break every test that imports
// lib/db/mongoClient.ts. This no-op shim replaces it only for tests — real
// Next.js builds still use the genuine package and its genuine enforcement.
export {};
