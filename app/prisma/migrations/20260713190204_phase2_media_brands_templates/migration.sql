-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('LOCAL', 'S3');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "fontFamily" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "logoUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "primaryColor" TEXT NOT NULL DEFAULT '#4f46e5',
ADD COLUMN     "s3AccessKeyId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "s3Bucket" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "s3Endpoint" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "s3PublicBaseUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "s3Region" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "s3SecretKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "secondaryColor" TEXT NOT NULL DEFAULT '#ef4444',
ADD COLUMN     "storageType" "StorageType" NOT NULL DEFAULT 'LOCAL';

-- CreateTable
CREATE TABLE "NewsItemMedia" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "NewsItemMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'upload',
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVariant" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "elements" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "TemplateVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsItemMedia_itemId_url_key" ON "NewsItemMedia"("itemId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVariant_templateId_aspect_key" ON "TemplateVariant"("templateId", "aspect");

-- AddForeignKey
ALTER TABLE "NewsItemMedia" ADD CONSTRAINT "NewsItemMedia_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "NewsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageTemplate" ADD CONSTRAINT "ImageTemplate_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVariant" ADD CONSTRAINT "TemplateVariant_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ImageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
