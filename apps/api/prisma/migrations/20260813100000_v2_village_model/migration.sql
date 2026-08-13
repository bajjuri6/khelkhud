-- v2: the village model. See docs/architecture/v2-village-model.md
--
-- DESTRUCTIVE BY DESIGN. Generated during the build phase when every environment
-- held only seed data, on the operator's explicit instruction. It DROPs PlayerProfile
-- and SponsorshipRequirement rather than renaming them.
--
-- Do not use this as the pattern once there is real data: renames preserve rows,
-- drops do not.

-- CreateEnum
CREATE TYPE "AthleteCategory" AS ENUM ('UNDER_12', 'UNDER_15', 'UNDER_19', 'SENIOR', 'PARA');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('LGD', 'INDIA_POST', 'MANUAL');

-- CreateEnum
CREATE TYPE "InstitutionKind" AS ENUM ('SCHOOL', 'PLAYGROUND', 'CLUB', 'ANGANWADI', 'OTHER');

-- CreateEnum
CREATE TYPE "RequestKind" AS ENUM ('EQUIPMENT', 'CASH');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'PENDING_VALIDATION', 'OPEN', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CLOSED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LocationLevel" ADD VALUE 'MANDAL';
ALTER TYPE "LocationLevel" ADD VALUE 'VILLAGE';

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('SPONSORSHIP_RECEIVED', 'ATHLETE_UPDATE', 'VERIFICATION_RESULT', 'PAYMENT_CONFIRMED', 'INFO_REQUESTED', 'SYSTEM');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ATHLETE', 'COORDINATOR', 'SPONSOR', 'SUPPLIER', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Achievement" DROP CONSTRAINT "Achievement_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_playerProfileId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_playerId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerProfile" DROP CONSTRAINT "PlayerProfile_locationId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerProfile" DROP CONSTRAINT "PlayerProfile_sportId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerProfile" DROP CONSTRAINT "PlayerProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "Sponsorship" DROP CONSTRAINT "Sponsorship_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Sponsorship" DROP CONSTRAINT "Sponsorship_requirementId_fkey";

-- DropForeignKey
ALTER TABLE "SponsorshipRequirement" DROP CONSTRAINT "SponsorshipRequirement_playerId_fkey";

-- DropForeignKey
ALTER TABLE "SponsorshipUpdate" DROP CONSTRAINT "SponsorshipUpdate_playerId_fkey";

-- DropForeignKey
ALTER TABLE "VerificationRecord" DROP CONSTRAINT "VerificationRecord_subjectPlayerId_fkey";

-- DropIndex
DROP INDEX "Achievement_playerId_idx";

-- DropIndex
DROP INDEX "Document_playerProfileId_idx";

-- DropIndex
DROP INDEX "Event_playerId_date_idx";

-- DropIndex
DROP INDEX "Sponsorship_playerId_status_idx";

-- DropIndex
DROP INDEX "SponsorshipUpdate_playerId_createdAt_idx";

-- DropIndex
DROP INDEX "VerificationRecord_subjectPlayerId_idx";

-- AlterTable
ALTER TABLE "Achievement" DROP COLUMN "playerId",
ADD COLUMN     "athleteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "playerProfileId",
ADD COLUMN     "athleteProfileId" TEXT;

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "playerId",
ADD COLUMN     "athleteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "displayPath" TEXT,
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lgdCode" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "source" "LocationSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Sponsorship" DROP COLUMN "playerId",
DROP COLUMN "requirementId",
ADD COLUMN     "athleteId" TEXT NOT NULL,
ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "SponsorshipUpdate" DROP COLUMN "playerId",
ADD COLUMN     "athleteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "VerificationRecord" DROP COLUMN "subjectPlayerId",
ADD COLUMN     "subjectAthleteId" TEXT;

-- DropTable
DROP TABLE "PlayerProfile";

-- DropTable
DROP TABLE "SponsorshipRequirement";

-- DropEnum
DROP TYPE "PlayerCategory";

-- CreateTable
CREATE TABLE "AthleteProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sportId" TEXT,
    "locationId" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "category" "AthleteCategory",
    "experienceLevel" "ExperienceLevel",
    "bio" TEXT,
    "photoKey" TEXT,
    "coachName" TEXT,
    "coachContact" TEXT,
    "academyName" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoordinatorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "phone" TEXT,
    "appointedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoordinatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "villageId" TEXT NOT NULL,
    "kind" "InstitutionKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "custodianId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "kind" "RequestKind" NOT NULL,
    "villageId" TEXT NOT NULL,
    "athleteId" TEXT,
    "institutionId" TEXT,
    "raisedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "deadline" TIMESTAMP(3),
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "totalEstimatedPaise" INTEGER NOT NULL DEFAULT 0,
    "raisedAmountPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "estimatedPaise" INTEGER NOT NULL,
    "fulfilledQty" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CoordinatorVillages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CoordinatorVillages_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "AthleteProfile_userId_key" ON "AthleteProfile"("userId");

-- CreateIndex
CREATE INDEX "AthleteProfile_sportId_verificationStatus_idx" ON "AthleteProfile"("sportId", "verificationStatus");

-- CreateIndex
CREATE INDEX "AthleteProfile_locationId_idx" ON "AthleteProfile"("locationId");

-- CreateIndex
CREATE INDEX "AthleteProfile_category_idx" ON "AthleteProfile"("category");

-- CreateIndex
CREATE UNIQUE INDEX "CoordinatorProfile_userId_key" ON "CoordinatorProfile"("userId");

-- CreateIndex
CREATE INDEX "CoordinatorProfile_isActive_idx" ON "CoordinatorProfile"("isActive");

-- CreateIndex
CREATE INDEX "Institution_villageId_idx" ON "Institution"("villageId");

-- CreateIndex
CREATE INDEX "Request_villageId_status_idx" ON "Request"("villageId", "status");

-- CreateIndex
CREATE INDEX "Request_athleteId_status_idx" ON "Request"("athleteId", "status");

-- CreateIndex
CREATE INDEX "Request_institutionId_status_idx" ON "Request"("institutionId", "status");

-- CreateIndex
CREATE INDEX "Request_status_kind_idx" ON "Request"("status", "kind");

-- CreateIndex
CREATE INDEX "RequestItem_requestId_idx" ON "RequestItem"("requestId");

-- CreateIndex
CREATE INDEX "_CoordinatorVillages_B_index" ON "_CoordinatorVillages"("B");

-- CreateIndex
CREATE INDEX "Achievement_athleteId_idx" ON "Achievement"("athleteId");

-- CreateIndex
CREATE INDEX "Document_athleteProfileId_idx" ON "Document"("athleteProfileId");

-- CreateIndex
CREATE INDEX "Event_athleteId_date_idx" ON "Event"("athleteId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Location_lgdCode_key" ON "Location"("lgdCode");

-- CreateIndex
CREATE INDEX "Location_pincode_idx" ON "Location"("pincode");

-- CreateIndex
CREATE INDEX "Location_level_pincode_idx" ON "Location"("level", "pincode");

-- CreateIndex
CREATE INDEX "Sponsorship_athleteId_status_idx" ON "Sponsorship"("athleteId", "status");

-- CreateIndex
CREATE INDEX "SponsorshipUpdate_athleteId_createdAt_idx" ON "SponsorshipUpdate"("athleteId", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationRecord_subjectAthleteId_idx" ON "VerificationRecord"("subjectAthleteId");

-- AddForeignKey
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinatorProfile" ADD CONSTRAINT "CoordinatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinatorProfile" ADD CONSTRAINT "CoordinatorProfile_appointedById_fkey" FOREIGN KEY ("appointedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_villageId_fkey" FOREIGN KEY ("villageId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_custodianId_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_villageId_fkey" FOREIGN KEY ("villageId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "CoordinatorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestItem" ADD CONSTRAINT "RequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipUpdate" ADD CONSTRAINT "SponsorshipUpdate_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRecord" ADD CONSTRAINT "VerificationRecord_subjectAthleteId_fkey" FOREIGN KEY ("subjectAthleteId") REFERENCES "AthleteProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CoordinatorVillages" ADD CONSTRAINT "_CoordinatorVillages_A_fkey" FOREIGN KEY ("A") REFERENCES "CoordinatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CoordinatorVillages" ADD CONSTRAINT "_CoordinatorVillages_B_fkey" FOREIGN KEY ("B") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

