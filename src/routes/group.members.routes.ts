import { Router } from "express";
import { GroupMembersController } from "../controllers/group.members.controller";

const router = Router({ mergeParams: true }); // Important: mergeParams: true

// Note: These routes are mounted under /:groupId
// So the full path will be: /api/group/:groupId/members

// ============= MEMBER MANAGEMENT =============
// Get all members of a group
router.get("/members", GroupMembersController.getGroupMembers);

// Get group members with rotation details
router.get("/members-rotation", GroupMembersController.getGroupMembersWithRotation);

// Get group info (including invite code)
router.get("/info", GroupMembersController.getGroupInfo);

// Get full group settings (admin only)
router.get("/settings", GroupMembersController.getGroupSettings);

// Remove a member from group (admin only)
router.delete("/members/:memberId", GroupMembersController.removeMember);

// Update member role (admin only)
router.put("/members/:memberId/role", GroupMembersController.updateMemberRole);

// Update member rotation settings (admin only)
router.put("/members/:memberId/rotation", GroupMembersController.updateMemberRotation);

// ============= GROUP MANAGEMENT =============
// Update group information (name, description) - admin only
router.put("/update", GroupMembersController.updateGroup);

// Delete group avatar (admin only)
router.delete("/avatar", GroupMembersController.deleteGroupAvatar);

// Reorder rotation sequence (admin only)
router.post("/reorder-rotation", GroupMembersController.reorderRotationSequence);

// Transfer ownership (admin only)
router.post("/transfer-ownership", GroupMembersController.transferOwnership);

// Regenerate invite code (admin only)
router.post("/regenerate-invite", GroupMembersController.regenerateInviteCode);

// Delete group (admin only)
router.delete("/delete", GroupMembersController.deleteGroup);

// ============= MEMBER SELF-SERVICE =============
// Leave group (member can leave their own membership)
router.delete("/leave", GroupMembersController.leaveGroup);

export default router; 