-- AlterTable
ALTER TABLE "VideoProject" ADD COLUMN     "captionRenderer" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "captionSrtUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "captionVttUrl" TEXT NOT NULL DEFAULT '';
