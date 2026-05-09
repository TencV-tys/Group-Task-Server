/*
  Warnings:

  - A unique constraint covering the columns `[taskId,userId,dueDate,timeSlotId]` on the table `assignments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `assignments_taskId_userId_dueDate_timeSlotId_key` ON `assignments`(`taskId`, `userId`, `dueDate`, `timeSlotId`);
