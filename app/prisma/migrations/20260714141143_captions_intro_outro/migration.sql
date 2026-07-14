-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "introUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "outroUrl" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "words" JSONB;

-- AlterTable
ALTER TABLE "VideoProject" ADD COLUMN     "captionStyleId" TEXT,
ADD COLUMN     "captionsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CaptionStyle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "style" JSONB NOT NULL,
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptionStyle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaptionStyle_name_key" ON "CaptionStyle"("name");
