import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const playground = await prisma.playground.findUnique({
    where: { id: "cmptwbdmf0001i3pktx6tpm9x" },
    include: {
      templateFiles: true,
    },
  });
  console.log("Playground:", JSON.stringify(playground, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
