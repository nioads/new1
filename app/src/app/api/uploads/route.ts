import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { storeFile } from "@/lib/storage";

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = /^(image|video|audio)\//;

export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const form = await req.formData();
    const file = form.get("file");
    const brandId = (form.get("brandId") as string) || null;
    const kind = (form.get("kind") as string) || "upload";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file field is required" }, { status: 400 });
    }
    if (!ALLOWED.test(file.type)) {
      return NextResponse.json({ error: "Only media files are allowed" }, { status: 415 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 25 MB)" }, { status: 413 });
    }

    const brand = brandId
      ? await prisma.brand.findUnique({ where: { id: brandId } })
      : null;
    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeFile(brand, buffer, file.name, file.type);

    const asset = await prisma.mediaAsset.create({
      data: {
        brandId: brand?.id ?? null,
        kind,
        url: stored.url,
        storageKey: stored.storageKey,
        mimeType: file.type,
      },
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const brandId = req.nextUrl.searchParams.get("brand") || undefined;
    const kind = req.nextUrl.searchParams.get("kind") || undefined;
    const assets = await prisma.mediaAsset.findMany({
      where: { ...(brandId ? { brandId } : {}), ...(kind ? { kind } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(assets);
  } catch (err) {
    return jsonError(err);
  }
}
