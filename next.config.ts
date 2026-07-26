import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The starter templates under vibecode-starters/ are read at runtime with
  // Node's fs (lib/template.ts -> scanTemplateDirectory) via a path built as
  // path.join(process.cwd(), templatePaths[template]). Because that path is
  // assembled from a runtime map lookup, @vercel/nft — which traces `import`,
  // `require` and `fs` usage *statically* — has no literal path to follow, so
  // it copied none of these files into the deployed function bundle. Confirmed
  // from production, not inferred: the route's own trace
  // (.next/server/app/api/template/[id]/route.js.nft.json) listed 267 files
  // and zero under vibecode-starters, and Vercel logged
  //   Error: Template directory '/var/task/vibecode-starters/react-ts' does not exist
  // on every new-project creation. This is purely a tracing gap — the files are
  // committed and there is no .vercelignore, so they reach the build fine.
  //
  // Keys are route globs matched with picomatch; values are globs resolved from
  // the project root. "/api/template/*" rather than "/api/template/[id]" on
  // purpose: picomatch reads [id] as a character class, so the literal route
  // name would need escaping (see Next's own output.md example) — a
  // single-segment * matches it without that, and covers /api/template/base too.
  //
  // Exactly two routes can execute loadTemplateScaffold (full import-graph
  // audit): this API route, and /dashboard via the createPlayground server
  // action that dashboard-content.tsx invokes. Globbing the whole directory
  // instead of listing the seven templatePaths entries individually is
  // deliberate — templatePaths is a hardcoded map, so an explicit list would
  // be correct today and would silently reintroduce this same production
  // outage the first time a template is added to lib/template.ts alone.
  // Cost is ~11MB per traced function, well inside Vercel's 250MB limit; the
  // committed starters carry no node_modules, so this cannot pull in
  // dependency trees.
  outputFileTracingIncludes: {
    "/api/template/*": ["./vibecode-starters/**/*"],
    "/dashboard": ["./vibecode-starters/**/*"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images:{
    remotePatterns:[
      {
        protocol:"https",
        hostname:"*",
        port:'',
        pathname:"/**"
      }
    ]
  },
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
    ];
  },
  reactStrictMode: false,
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
  turbopack: {},
};

export default nextConfig;
