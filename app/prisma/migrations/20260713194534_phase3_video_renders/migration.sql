-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('QUEUED', 'PROCESSING', 'DONE', 'ERROR');

-- AlterTable
ALTER TABLE "ImageTemplate" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'breaking',
ADD COLUMN     "motion" JSONB;

-- CreateTable
CREATE TABLE "VideoRender" (
    "id" TEXT NOT NULL,
    "status" "RenderStatus" NOT NULL DEFAULT 'QUEUED',
    "aspect" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "outputUrl" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "itemId" TEXT,
    "templateId" TEXT,
    "brandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoRender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoRender_status_createdAt_idx" ON "VideoRender"("status", "createdAt");
