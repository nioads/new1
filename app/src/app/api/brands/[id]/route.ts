import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontFamily: z.string().max(120).optional(),
  storageType: z.enum(["LOCAL", "S3"]).optional(),
  s3Endpoint: z.string().optional(),
  s3Region: z.string().optional(),
  s3Bucket: z.string().optional(),
  s3AccessKeyId: z.string().optional(),
  s3SecretKey: z.string().optional(),
  s3PublicBaseUrl: z.string().optional(),
  introUrl: z.string().optional(),
  outroUrl: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const brand = await prisma.brand.update({
      where: { id },
      data: body,
      include: { _count: { select: { feeds: true, templates: true } } },
    });
    return NextResponse.json(brand);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    await prisma.brand.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
