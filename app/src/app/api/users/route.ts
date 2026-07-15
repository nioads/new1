import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(users);
  } catch (err) {
    return jsonError(err);
  }
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "EDITOR"]),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = createSchema.parse(await req.json());
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase().trim(),
        name: body.name.trim(),
        role: body.role,
        passwordHash: await bcrypt.hash(body.password, 10),
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
