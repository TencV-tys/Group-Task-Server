// src/routes/group.members.routes.ts
import { Router } from "express";
import { GroupMembersController } from "../controllers/group.members.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";

const router = Router();

// All routes require authentication
router.use(UserAuthMiddleware);

// Get all members of a group
router.get("/:groupId/members", GroupMembersController.getGroupMembers);

// Remove a member from group (admin only)
router.delete("/:groupId/members/:memberId", GroupMembersController.removeMember);

// Update member role (admin only)
router.put("/:groupId/members/:memberId/role", GroupMembersController.updateMemberRole);

// Leave group (member can leave their own membership)
router.delete("/:groupId/leave", GroupMembersController.leaveGroup);

export default router;