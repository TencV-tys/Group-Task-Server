// routes/admin.groups.routes.ts
import { Router } from "express";
import { AdminGroupsController } from "../controllers/admin.groups.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";
import { AuditLog } from "../middlewares/admin.audit.middleware";
import { validateGroupId } from "../middlewares/validation.middleware";

const router = Router();

// All routes require admin authentication
router.use(AdminAuthMiddleware);

// ========== VIEW ROUTES (NO AUDIT - READ ONLY) ==========
/**
 * @route   GET /api/admin/groups
 * @desc    Get all groups with filters
 * @access  Private (Admin)
 */
router.get('/', AdminGroupsController.getGroups);

/**
 * @route   GET /api/admin/groups/statistics
 * @desc    Get group statistics
 * @access  Private (Admin)
 */
router.get('/statistics', AdminGroupsController.getGroupStatistics);

/**
 * @route   GET /api/admin/groups/export
 * @desc    Export groups data
 * @access  Private (Admin)
 */
router.get('/export', AdminGroupsController.exportGroups);

/**
 * @route   GET /api/admin/groups/:groupId
 * @desc    Get group by ID with full details
 * @access  Private (Admin)
 */
router.get('/:groupId', validateGroupId, AdminGroupsController.getGroupById);

/**
 * @route   GET /api/admin/groups/:groupId/members
 * @desc    Get all members of a group
 * @access  Private (Admin)
 */
router.get('/:groupId/members', validateGroupId, AdminGroupsController.getGroupMembers);

// ========== MODIFY ROUTES (WITH AUDIT) ==========

/**
 * @route   DELETE /api/admin/groups/:groupId
 * @desc    Delete a group (soft or hard delete)
 * @access  Private (Admin)
 */
router.delete(
  '/:groupId', 
  validateGroupId,
  AuditLog('ADMIN_DELETE_GROUP', (req) => req.params.groupId as string), // 👈 ADD AUDIT
  AdminGroupsController.deleteGroup
);

/**
 * @route   DELETE /api/admin/groups/:groupId/members/:memberId
 * @desc    Remove a member from a group
 * @access  Private (Admin)
 */
router.delete(
  '/:groupId/members/:memberId', 
  validateGroupId,
  AuditLog('ADMIN_REMOVE_GROUP_MEMBER', (req) => req.params.memberId as string), // 👈 ADD AUDIT
  AdminGroupsController.removeMember
);

/**
 * @route   POST /api/admin/groups/bulk-delete
 * @desc    Bulk delete multiple groups
 * @access  Private (Admin)
 */
router.post(
  '/bulk-delete', 
  AuditLog('ADMIN_BULK_DELETE_GROUPS', (req) => { // 👈 ADD AUDIT
    const groupIds = (req.body.groupIds || []) as string[];
    return groupIds.length > 0 ? groupIds[0] : 'bulk-operation';
  }),
  AdminGroupsController.bulkDeleteGroups
);

export default router;