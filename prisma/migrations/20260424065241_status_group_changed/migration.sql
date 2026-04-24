-- DropIndex
DROP INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`;

-- DropIndex
DROP INDEX `refresh_tokens_token_idx` ON `refresh_tokens`;

-- CreateIndex
CREATE INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`(`token`);

-- CreateIndex
CREATE INDEX `refresh_tokens_token_idx` ON `refresh_tokens`(`token`);

-- AddForeignKey
ALTER TABLE `groups` ADD CONSTRAINT `groups_statusChangedBy_fkey` FOREIGN KEY (`statusChangedBy`) REFERENCES `system_admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
