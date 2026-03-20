-- DropIndex
DROP INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`;

-- DropIndex
DROP INDEX `refresh_tokens_token_idx` ON `refresh_tokens`;

-- AlterTable
ALTER TABLE `assignments` ADD COLUMN `missedTimeSlotIds` JSON NULL,
    ADD COLUMN `originalTotalPoints` INTEGER NULL DEFAULT 0,
    ADD COLUMN `partiallyExpired` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `slotPoints` JSON NULL;

-- CreateIndex
CREATE INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`(`token`);

-- CreateIndex
CREATE INDEX `refresh_tokens_token_idx` ON `refresh_tokens`(`token`);
