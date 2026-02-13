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

// Get group swap requests (admin only)
router.get('/group/:groupId', SwapRequestController.getGroupSwapRequests);

// Get single swap request details
router.get('/:requestId', SwapRequestController.getSwapRequestDetails);

// Accept a swap request
router.post('/:requestId/accept', SwapRequestController.acceptSwapRequest);

// Reject a swap request
router.post('/:requestId/reject', SwapRequestController.rejectSwapRequest);

// Cancel a swap request (only by requester)
router.post('/:requestId/cancel', SwapRequestController.cancelSwapRequest);

export default router;