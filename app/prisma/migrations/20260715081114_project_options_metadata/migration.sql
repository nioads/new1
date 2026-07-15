-- AlterTable
ALTER TABLE "VideoProject" ADD COLUMN     "scriptModel" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "smCaption" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "smDescription" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "smHighlight" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "smTags" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "targetSeconds" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "visualMode" TEXT NOT NULL DEFAULT 'search';
