import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function GET() {
  try {
    await requireSession();
    return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? "" });
  } catch (err) {
    return jsonError(err);
  }
}

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = subscribeSchema.parse(await req.json());
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { p256dh: body.keys.p256dh, auth: body.keys.auth, userId: session.user.id },
      create: {
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userId: session.user.id,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}

const unsubscribeSchema = z.object({ endpoint: z.string() });

export async function DELETE(req: NextRequest) {
  try {
    await requireSession();
    const body = unsubscribeSchema.parse(await req.json());
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
