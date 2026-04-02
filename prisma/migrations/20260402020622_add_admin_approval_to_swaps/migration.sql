-- DropIndex
DROP INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`;

-- DropIndex
DROP INDEX `refresh_tokens_token_idx` ON `refresh_tokens`;

-- AlterTable
ALTER TABLE `swap_requests` ADD COLUMN `acceptedAt` DATETIME(3) NULL,
    ADD COLUMN `acceptedBy` VARCHAR(191) NULL,
    ADD COLUMN `adminApproved` BOOLEAN NULL,
    ADD COLUMN `adminApprovedAt` DATETIME(3) NULL,
    ADD COLUMN `adminApprovedBy` VARCHAR(191) NULL,
    ADD COLUMN `adminRejectionReason` VARCHAR(191) NULL,
    ADD COLUMN `autoApproved` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `requiresAdminApproval` BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`(`token`);

-- CreateIndex
CREATE INDEX `refresh_tokens_token_idx` ON `refresh_tokens`(`token`);
