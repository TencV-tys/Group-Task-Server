// src/routes/group.members.routes.ts
import { Router } from "express";
import { GroupMembersController } from "../controllers/group.members.controller";

const router = Router({ mergeParams: true }); // Important: mergeParams: true

// Note: These routes are mounted under /:groupId
// So the full path will be: /api/group/:groupId/members

// Get all members of a group
router.get("/members", GroupMembersController.getGroupMembers);

// Get group info (including invite code)
router.get("/info", GroupMembersController.getGroupInfo);

// Remove a member from group (admin only)
router.delete("/members/:memberId", GroupMembersController.removeMember);

// Update member role (admin only)
router.put("/members/:memberId/role", GroupMembersController.updateMemberRole);

// Leave group (member can leave their own membership)
router.delete("/leave", GroupMembersController.leaveGroup);

export default router;