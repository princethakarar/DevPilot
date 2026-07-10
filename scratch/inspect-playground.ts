import { findPlaygroundWithTemplateFiles } from "../lib/db/repositories/playgrounds";

async function main() {
  const playground = await findPlaygroundWithTemplateFiles("cmptwbdmf0001i3pktx6tpm9x");
  console.log("Playground:", JSON.stringify(playground, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
