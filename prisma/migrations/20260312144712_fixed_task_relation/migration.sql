-- DropForeignKey
ALTER TABLE `assignments` DROP FOREIGN KEY `assignments_taskId_fkey`;

-- DropIndex
DROP INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`;

-- DropIndex
DROP INDEX `assignments_taskId_fkey` ON `assignments`;

-- DropIndex
DROP INDEX `refresh_tokens_token_idx` ON `refresh_tokens`;

-- AlterTable
ALTER TABLE `assignments` MODIFY `taskId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`(`token`);

-- CreateIndex
CREATE INDEX `refresh_tokens_token_idx` ON `refresh_tokens`(`token`);

-- AddForeignKey
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
