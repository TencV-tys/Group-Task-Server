-- DropIndex
DROP INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`;

-- DropIndex
DROP INDEX `refresh_tokens_token_idx` ON `refresh_tokens`;

-- AlterTable
ALTER TABLE `group_members` ADD COLUMN `cumulativePoints` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `pointsUpdatedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`(`token`);

-- CreateIndex
CREATE INDEX `refresh_tokens_token_idx` ON `refresh_tokens`(`token`);
