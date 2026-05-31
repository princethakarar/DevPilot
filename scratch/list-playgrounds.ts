import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const playgrounds = await prisma.playground.findMany({
    select: {
      id: true,
      title: true,
    },
  });
  console.log("Playgrounds:", playgrounds);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
