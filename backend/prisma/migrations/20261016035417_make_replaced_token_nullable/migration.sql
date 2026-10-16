/*
  Warnings:

  - A unique constraint covering the columns `[replacedByTokenHash]` on the table `RefreshSession` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "RefreshSession" ALTER COLUMN "replacedByTokenHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_replacedByTokenHash_key" ON "RefreshSession"("replacedByTokenHash");
