-- AlterTable
ALTER TABLE "VideoProject" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'article',
ALTER COLUMN "itemId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "VideoTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandId" TEXT,
    "aspect" TEXT NOT NULL DEFAULT '9:16',
    "clipCount" INTEGER NOT NULL DEFAULT 1,
    "perClipSeconds" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "transition" TEXT NOT NULL DEFAULT 'fade',
    "kenburns" TEXT NOT NULL DEFAULT 'in',
    "captionStyleId" TEXT,
    "musicTrackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoTemplate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VideoTemplate" ADD CONSTRAINT "VideoTemplate_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
