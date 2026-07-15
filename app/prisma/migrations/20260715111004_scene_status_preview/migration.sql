-- CreateEnum
CREATE TYPE "SceneStatus" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'PREVIEW_READY', 'REQUIRES_CHANGES', 'APPROVED', 'RENDER_FAILED');

-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "previewError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "previewUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" "SceneStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX "Scene_status_idx" ON "Scene"("status");
