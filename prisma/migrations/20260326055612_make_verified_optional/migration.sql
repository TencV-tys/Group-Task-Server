-- DropIndex
DROP INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`;

-- DropIndex
DROP INDEX `refresh_tokens_token_idx` ON `refresh_tokens`;

-- AlterTable
ALTER TABLE `assignments` MODIFY `completed` BOOLEAN NULL DEFAULT false,
    MODIFY `verified` BOOLEAN NULL;

-- CreateIndex
CREATE INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`(`token`);

-- CreateIndex
CREATE INDEX `refresh_tokens_token_idx` ON `refresh_tokens`(`token`);
