import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Admin",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
  });

  const defaults: Array<{ name: string; color: string }> = [
    { name: "Breaking News", color: "#ef4444" },
    { name: "Politics", color: "#3b82f6" },
    { name: "Business", color: "#10b981" },
    { name: "Sports", color: "#f59e0b" },
    { name: "Technology", color: "#8b5cf6" },
  ];
  for (const c of defaults) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
  }

  const { BUILTIN_CAPTION_STYLES } = await import("../src/lib/captions");
  for (const preset of BUILTIN_CAPTION_STYLES) {
    await prisma.captionStyle.upsert({
      where: { name: preset.name },
      update: {},
      create: {
        name: preset.name,
        style: JSON.parse(JSON.stringify(preset.style)),
        builtin: true,
      },
    });
  }

  console.log(
    `Seeded admin user ${adminEmail}, ${defaults.length} categories, ${BUILTIN_CAPTION_STYLES.length} caption styles.`,
  );
}

main().finally(() => prisma.$disconnect());
