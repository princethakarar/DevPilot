"use server";

import { findPlaygroundSummaryWithTemplateFiles } from "@/lib/db/repositories/playgrounds";
import { upsertTemplateFileForPlayground } from "@/lib/db/repositories/templateFiles";
import { TemplateFolder } from "../lib/path-to-json";
import { currentUser } from "@/modules/auth/actions";

export const getPlaygroundById = async(id:string)=>{
    if (!id || id === "undefined") return null;
    try {
        const playground = await findPlaygroundSummaryWithTemplateFiles(id);
        return playground;
    } catch (error) {
        console.log(error)
    }
}

export const SaveUpdatedCode = async(playgroundId:string , data:TemplateFolder)=>{
    const user = await currentUser();
  if (!user) return null;

  try {
    const updatedPlayground = await upsertTemplateFileForPlayground(
      playgroundId,
      JSON.stringify(data)
    );

    return updatedPlayground;
  } catch (error) {
     console.log("SaveUpdatedCode error:", error);
    return null;
  }
}
