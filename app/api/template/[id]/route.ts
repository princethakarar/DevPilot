import { scanTemplateDirectory } from "@/modules/playground/lib/path-to-json";
import { findPlaygroundById } from "@/lib/db/repositories/playgrounds";
import { templatePaths } from "@/lib/template";
import path from "path";
import fs from "fs/promises";
import { NextRequest } from "next/server";

function validateJsonStructure(data: unknown): boolean {
  try {
    JSON.parse(JSON.stringify(data)); // Ensures it's serializable
    return true;
  } catch (error) {
    console.error("Invalid JSON structure:", error);
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

const {id} = await params;

if(!id || id === "undefined" || id === "ready"){
      return Response.json({ error: "Missing playground ID" }, { status: 400 });
}

const playground = await findPlaygroundById(id)

  if (!playground) {
    return Response.json({ error: "Playground not found" }, { status: 404 });
  }
  
  const templateKey = playground.template as keyof typeof templatePaths;
  const templatePath = templatePaths[templateKey]

    if (templateKey === "NODE") {
      const nodeTemplate = {
        folderName: "node",
        items: [
          {
            filename: "package",
            fileExtension: "json",
            content: "{\n  \"name\": \"project-name\",\n  \"version\": \"1.0.0\",\n  \"description\": \"\",\n  \"main\": \"index.js\",\n  \"scripts\": {\n    \"test\": \"echo \\\"Error: no test specified\\\" && exit 1\"\n  },\n  \"keywords\": [],\n  \"author\": \"\",\n  \"license\": \"ISC\"\n}"
          },
          {
            filename: "index",
            fileExtension: "js",
            content: "// Welcome to your Node.js project!\nconsole.log('Hello, Node.js!');\n"
          },
          {
            filename: ".gitignore",
            fileExtension: "",
            content: "node_modules/\n.env\n"
          }
        ]
      };
      return Response.json({ success: true, templateJson: nodeTemplate }, { status: 200 });
    }

    if (!templatePath) {
    return Response.json({ error: "Invalid template" }, { status: 404 });
  }

  try {
    const inputPath = path.join(/*turbopackIgnore: true*/ process.cwd() , templatePath);

    const result = await scanTemplateDirectory(inputPath);

    // Validate the JSON structure before saving
    if (!validateJsonStructure(result.items)) {
      return Response.json({ error: "Invalid JSON structure" }, { status: 500 });
    }

      return Response.json({ success: true, templateJson: result }, { status: 200 });
  } catch (error) {
      console.error("Error generating template JSON:", error);
    return Response.json({ error: "Failed to generate template" }, { status: 500 });
  }


}
