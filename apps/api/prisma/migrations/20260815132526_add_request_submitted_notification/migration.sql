-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REQUEST_SUBMITTED';

-- DropIndex
DROP INDEX "Location_aliases_idx";

-- DropEnum
DROP TYPE "RequirementStatus";
