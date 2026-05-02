/*
  Warnings:

  - You are about to alter the column `token` on the `admin_refresh_tokens` table. The data in that column could be lost. The data in that column will be cast from `VarChar(1000)` to `VarChar(500)`.
  - You are about to alter the column `token` on the `refresh_tokens` table. The data in that column could be lost. The data in that column will be cast from `VarChar(1000)` to `VarChar(500)`.

*/
-- DropForeignKey
ALTER TABLE `admin_audit_logs` DROP FOREIGN KEY `admin_audit_logs_adminId_fkey`;

-- DropForeignKey
ALTER TABLE `admin_audit_logs` DROP FOREIGN KEY `admin_audit_logs_targetUserId_fkey`;

-- DropForeignKey
ALTER TABLE `admin_notifications` DROP FOREIGN KEY `admin_notifications_adminId_fkey`;

-- DropForeignKey
ALTER TABLE `admin_refresh_tokens` DROP FOREIGN KEY `admin_refresh_tokens_adminId_fkey`;

-- DropForeignKey
ALTER TABLE `assignments` DROP FOREIGN KEY `assignments_taskId_fkey`;

-- DropForeignKey
ALTER TABLE `assignments` DROP FOREIGN KEY `assignments_timeSlotId_fkey`;

-- DropForeignKey
ALTER TABLE `assignments` DROP FOREIGN KEY `assignments_userId_fkey`;

-- DropForeignKey
ALTER TABLE `feedback` DROP FOREIGN KEY `feedback_userId_fkey`;

-- DropForeignKey
ALTER TABLE `group_members` DROP FOREIGN KEY `group_members_groupId_fkey`;

-- DropForeignKey
ALTER TABLE `group_members` DROP FOREIGN KEY `group_members_userId_fkey`;

-- DropForeignKey
ALTER TABLE `groups` DROP FOREIGN KEY `groups_createdById_fkey`;

-- DropForeignKey
ALTER TABLE `groups` DROP FOREIGN KEY `groups_statusChangedBy_fkey`;

-- DropForeignKey
ALTER TABLE `refresh_tokens` DROP FOREIGN KEY `refresh_tokens_userId_fkey`;

-- DropForeignKey
ALTER TABLE `reports` DROP FOREIGN KEY `reports_groupId_fkey`;

-- DropForeignKey
ALTER TABLE `reports` DROP FOREIGN KEY `reports_reporterId_fkey`;

-- DropForeignKey
ALTER TABLE `reports` DROP FOREIGN KEY `reports_resolvedBy_fkey`;

-- DropForeignKey
ALTER TABLE `swap_requests` DROP FOREIGN KEY `swap_requests_assignmentId_fkey`;

-- DropForeignKey
ALTER TABLE `tasks` DROP FOREIGN KEY `tasks_createdById_fkey`;

-- DropForeignKey
ALTER TABLE `tasks` DROP FOREIGN KEY `tasks_groupId_fkey`;

-- DropForeignKey
ALTER TABLE `tasks` DROP FOREIGN KEY `tasks_primaryTimeSlotId_fkey`;

-- DropForeignKey
ALTER TABLE `time_slots` DROP FOREIGN KEY `time_slots_taskId_fkey`;

-- DropForeignKey
ALTER TABLE `user_devices` DROP FOREIGN KEY `user_devices_userId_fkey`;

-- DropForeignKey
ALTER TABLE `user_notifications` DROP FOREIGN KEY `user_notifications_userId_fkey`;

-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `users_roleStatusChangedBy_fkey`;

-- DropIndex
DROP INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`;

-- DropIndex
DROP INDEX `assignments_taskId_fkey` ON `assignments`;

-- DropIndex
DROP INDEX `group_members_groupId_fkey` ON `group_members`;

-- DropIndex
DROP INDEX `groups_createdById_fkey` ON `groups`;

-- DropIndex
DROP INDEX `groups_statusChangedBy_fkey` ON `groups`;

-- DropIndex
DROP INDEX `refresh_tokens_token_idx` ON `refresh_tokens`;

-- DropIndex
DROP INDEX `reports_resolvedBy_fkey` ON `reports`;

-- DropIndex
DROP INDEX `swap_requests_assignmentId_fkey` ON `swap_requests`;

-- DropIndex
DROP INDEX `tasks_createdById_fkey` ON `tasks`;

-- DropIndex
DROP INDEX `tasks_groupId_fkey` ON `tasks`;

-- DropIndex
DROP INDEX `users_roleStatusChangedBy_fkey` ON `users`;

-- AlterTable
ALTER TABLE `admin_refresh_tokens` MODIFY `token` VARCHAR(500) NOT NULL;

-- AlterTable
ALTER TABLE `refresh_tokens` MODIFY `token` VARCHAR(500) NOT NULL;

-- AlterTable
ALTER TABLE `user_devices` MODIFY `expoPushToken` VARCHAR(500) NOT NULL;

-- CreateIndex
CREATE INDEX `admin_refresh_tokens_token_idx` ON `admin_refresh_tokens`(`token`);

-- CreateIndex
CREATE INDEX `refresh_tokens_token_idx` ON `refresh_tokens`(`token`);
