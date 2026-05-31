import { findFilePath, generateFileId } from "../modules/playground/lib";
import { TemplateFolder, TemplateFile } from "../modules/playground/lib/path-to-json";

const templateData: TemplateFolder = {
  "folderName": "react-ts",
  "items": [
    {
      "filename": "package",
      "fileExtension": "json",
      "content": "{}"
    },
    {
      "folderName": "public",
      "items": [
        {
          "filename": "index",
          "fileExtension": "html",
          "content": "<div id=\"app\"></div>"
        }
      ]
    },
    {
      "folderName": "src",
      "items": [
        {
          "filename": "App",
          "fileExtension": "tsx",
          "content": "import ..."
        }
      ]
    }
  ]
};

const packageJson = templateData.items[0] as TemplateFile;
const indexHtml = (templateData.items[1] as TemplateFolder).items[0] as TemplateFile;
const appTsx = (templateData.items[2] as TemplateFolder).items[0] as TemplateFile;

console.log("packageJson findFilePath:", findFilePath(packageJson, templateData));
console.log("packageJson generateFileId:", generateFileId(packageJson, templateData));

console.log("indexHtml findFilePath:", findFilePath(indexHtml, templateData));
console.log("indexHtml generateFileId:", generateFileId(indexHtml, templateData));

console.log("appTsx findFilePath:", findFilePath(appTsx, templateData));
console.log("appTsx generateFileId:", generateFileId(appTsx, templateData));
