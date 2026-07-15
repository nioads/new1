import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { generateMetadata } from "@/lib/ai";

const schema = z.object({
  // supply either a news item id, a project id, or raw title/body
  itemId: z.string().optional(),
  projectId: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
});

// Generates social metadata (highlight, caption, YouTube description, tags)
// for any content. When a projectId is given the result is also persisted.
export async function POST(req: NextRequest) {
  try {
    await requireSession();
    const b = schema.parse(await req.json());
    let title = b.title ?? "";
    let body = b.body ?? "";
    const projectId = b.projectId;

    if (b.itemId) {
      const item = await prisma.newsItem.findUnique({ where: { id: b.itemId } });
      if (item) {
        title = item.title;
        body = item.content || item.summary;
      }
    }
    if (b.projectId) {
      const project = await prisma.videoProject.findUnique({ where: { id: b.projectId } });
      if (project) {
        const item = await prisma.newsItem.findUnique({ where: { id: project.itemId } });
        if (item) {
          title = title || item.title;
          body = body || item.content || item.summary;
        }
      }
    }
    if (!title && !body) {
      return NextResponse.json({ error: "No content to summarize" }, { status: 400 });
    }

    const settings = await getSettings(prisma);
    const meta = await generateMetadata(settings, { title, body });

    if (projectId) {
      await prisma.videoProject.update({
        where: { id: projectId },
        data: {
          smHighlight: meta.highlight,
          smCaption: meta.caption,
          smDescription: meta.description,
          smTags: meta.tags.join(", "),
        },
      });
    }
    return NextResponse.json(meta);
  } catch (err) {
    return jsonError(err);
  }
}
