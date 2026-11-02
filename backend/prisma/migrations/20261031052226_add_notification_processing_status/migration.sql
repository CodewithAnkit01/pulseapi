-- AlterEnum
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "NotificationDelivery" ADD COLUMN     "processingAt" TIMESTAMP(3);
