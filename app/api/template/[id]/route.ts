import { findPlaygroundById } from "@/lib/db/repositories/playgrounds";
import { upsertTemplateFileForPlayground } from "@/lib/db/repositories/templateFiles";
import { loadTemplateScaffold } from "@/lib/template";
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

  try {
    const result = await loadTemplateScaffold(playground.template);

    // Validate the JSON structure before saving
    if (!validateJsonStructure(result.items)) {
      return Response.json({ error: "Invalid JSON structure" }, { status: 500 });
    }

    // Self-heal: this route only runs when the store has no TemplateFile
    // content yet (see usePlayground.tsx's fallback branch) — either a
    // pre-existing project from before scaffolds were persisted at creation
    // time, or a rare race. Persisting here means the NEXT load (and any
    // GitHub push in between) sees real stored content instead of hitting
    // "No file content found" again. Reuses the exact same upsert autosave
    // uses — no parallel write path, and no new client→server endpoint needed
    // since this route already exists and is already invoked for this case.
    try {
      await upsertTemplateFileForPlayground(id, JSON.stringify(result));
    } catch (persistError) {
      // Non-fatal: the client still gets a usable tree to render even if the
      // backfill write fails; it'll simply retry next load.
      console.error(`[template-scaffold] Failed to backfill TemplateFile for playground ${id}:`, persistError);
    }

      return Response.json({ success: true, templateJson: result }, { status: 200 });
  } catch (error) {
      console.error("Error generating template JSON:", error);
    return Response.json({ error: "Failed to generate template" }, { status: 500 });
  }


}
