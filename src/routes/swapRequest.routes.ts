// routes/swapRequest.routes.ts - COMPLETE WITH ALL ROUTES

import { Router } from "express";
import { SwapRequestController } from "../controllers/swapRequest.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";

const router = Router();

// All swap request routes require authentication
router.use(UserAuthMiddleware);

// ============= SWAP REQUEST ROUTES =============

// Create a swap request
router.post('/create', SwapRequestController.createSwapRequest);

// Get my swap requests (requests I created)
router.get('/my-requests', SwapRequestController.getMySwapRequests);

// Get pending swap requests for me (to accept/reject)
router.get('/pending-for-me', SwapRequestController.getPendingForMe);

// Check if assignment can be swapped
router.get('/check/:assignmentId', SwapRequestController.checkCanSwap);

// Check if user has assignment on a specific day (for DAY swaps)
router.get('/check-user-assignment', SwapRequestController.checkUserHasAssignmentOnDay);

// ✅ ADD THIS: Check if user has ANY assignments this week (for WEEK swaps)
router.get('/check-user-week-assignments', SwapRequestController.checkUserHasAnyAssignmentThisWeek);

// ============= ADMIN APPROVAL ROUTES =============

// Get pending swap requests for admin approval
router.get('/admin/pending/:groupId', SwapRequestController.getPendingForAdminApproval);

// Admin approve swap request
router.post('/admin/:requestId/approve', SwapRequestController.adminApproveSwapRequest);

// Admin reject swap request
router.post('/admin/:requestId/reject', SwapRequestController.adminRejectSwapRequest);

// ============= GROUP SWAP HISTORY (Admin view) =============

// Get group swap requests with pagination and filters (admin only)
router.get('/group/:groupId', SwapRequestController.getGroupSwapRequests);

// ============= SINGLE REQUEST ACTIONS =============

// Get single swap request details
router.get('/:requestId', SwapRequestController.getSwapRequestDetails);

// Accept a swap request (by member)
router.post('/:requestId/accept', SwapRequestController.acceptSwapRequest);

// Reject a swap request (by target user or admin)
router.post('/:requestId/reject', SwapRequestController.rejectSwapRequest);

// Cancel a swap request (only by requester)
router.post('/:requestId/cancel', SwapRequestController.cancelSwapRequest);

export default router;