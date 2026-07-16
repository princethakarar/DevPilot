import path from "path";
import { scanTemplateDirectory, type TemplateFolder } from "@/modules/playground/lib/path-to-json";
import type { Templates } from "@/lib/db/schemas";

export const templatePaths = {
  REACT: "/vibecode-starters/react-ts",
  NEXTJS: "/vibecode-starters/nextjs",
  EXPRESS: "/vibecode-starters/express-simple",
  VUE: "/vibecode-starters/vue",
  HONO: "/vibecode-starters/hono-nodejs-starter",
  ANGULAR: "/vibecode-starters/angular",
  NODE: "/vibecode-starters/node",
};

/**
 * NODE has no on-disk starter directory (see templatePaths) — its scaffold is
 * this tiny hardcoded tree instead. Kept here (not scanned from disk) so both
 * callers of loadTemplateScaffold below — eager creation-time persistence and
 * the API route's lazy fallback — share the exact same source instead of
 * drifting into two hand-maintained copies.
 */
function nodeTemplateScaffold(): TemplateFolder {
  return {
    folderName: "node",
    items: [
      {
        filename: "package",
        fileExtension: "json",
        content: "{\n  \"name\": \"project-name\",\n  \"version\": \"1.0.0\",\n  \"description\": \"\",\n  \"main\": \"index.js\",\n  \"scripts\": {\n    \"test\": \"echo \\\"Error: no test specified\\\" && exit 1\"\n  },\n  \"keywords\": [],\n  \"author\": \"\",\n  \"license\": \"ISC\"\n}",
      },
      {
        filename: "index",
        fileExtension: "js",
        content: "// Welcome to your Node.js project!\nconsole.log('Hello, Node.js!');\n",
      },
      {
        filename: ".gitignore",
        fileExtension: "",
        content: "node_modules/\n.env\n",
      },
    ],
  };
}

/**
 * Single source of truth for "what does a brand-new project of this template
 * look like". Used both to eagerly persist a project's starter files at
 * creation time (dashboard/actions/index.ts) and by the API route's lazy
 * fallback (app/api/template/[id]/route.ts) — reading straight off the
 * server's local starter-template directory, never from WebContainer (which
 * only exists client-side and can't be read from a server action anyway).
 */
export async function loadTemplateScaffold(template: Templates): Promise<TemplateFolder> {
  if (template === "NODE") return nodeTemplateScaffold();

  const templatePath = templatePaths[template];
  if (!templatePath) throw new Error(`Unknown template: ${template}`);

  const inputPath = path.join(/*turbopackIgnore: true*/ process.cwd(), templatePath);
  return scanTemplateDirectory(inputPath);
}
