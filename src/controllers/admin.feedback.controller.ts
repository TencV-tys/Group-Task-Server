import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import { AdminFeedbackService } from "../services/admin.feedback.service";

export class AdminFeedbackController {
  
  // ========== GET ALL FEEDBACK ==========
  static async getFeedback(req: AdminAuthRequest, res: Response) {
    console.log('🎯 [CONTROLLER] getFeedback - START');
    console.log('  📍 Query:', req.query);
    console.log('  👤 Admin:', req.admin?.id);
    
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        console.log('❌ [CONTROLLER] No admin authenticated');
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const {
        status,
        type,
        search,
        page,
        limit,
        sortBy,
        sortOrder
      } = req.query;

      const filters = {
        status: status as string,
        type: type as string,
        search: search as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      };

      console.log('  📦 Filters:', JSON.stringify(filters, null, 2));

      const result = await AdminFeedbackService.getFeedback(filters);
      
      console.log('  ✅ Result success:', result.success);
      console.log('  📊 Data count:', result.data?.feedback?.length);
      console.log('🎯 [CONTROLLER] getFeedback - END');

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error('💥 [CONTROLLER] getFeedback ERROR:', error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET FILTERED FEEDBACK STATS ==========
  static async getFilteredFeedbackStats(req: AdminAuthRequest, res: Response) {
    console.log('🎯 [CONTROLLER] getFilteredFeedbackStats - START');
    console.log('  📍 Query:', req.query);
    
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        console.log('❌ [CONTROLLER] No admin authenticated');
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { status, type, search } = req.query;

      const filters = {
        status: status as string,
        type: type as string,
        search: search as string
      };

      console.log('  📦 Filters:', filters);

      const result = await AdminFeedbackService.getFilteredFeedbackStats(filters);
      
      console.log('  ✅ Result:', result.data);
      console.log('🎯 [CONTROLLER] getFilteredFeedbackStats - END');

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error('💥 [CONTROLLER] getFilteredFeedbackStats ERROR:', error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET SINGLE FEEDBACK ==========
  static async getFeedbackById(req: AdminAuthRequest, res: Response) {
    console.log('🎯 [CONTROLLER] getFeedbackById - START');
    console.log('  📍 Params:', req.params);
    
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        console.log('❌ [CONTROLLER] No admin authenticated');
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { feedbackId } = req.params as { feedbackId: string };
      console.log('  🔍 Feedback ID:', feedbackId);

      const result = await AdminFeedbackService.getFeedbackById(feedbackId);
      
      console.log('  ✅ Found:', result.success);
      console.log('🎯 [CONTROLLER] getFeedbackById - END');

      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error('💥 [CONTROLLER] getFeedbackById ERROR:', error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== UPDATE FEEDBACK STATUS ==========
  static async updateFeedbackStatus(req: AdminAuthRequest, res: Response) {
    console.log('═══════════════════════════════════════════════════');
    console.log('🎯🎯🎯 [CONTROLLER] updateFeedbackStatus - START 🎯🎯🎯');
    console.log('═══════════════════════════════════════════════════');
    console.log('  📍 Params:', req.params);
    console.log('  📦 Body:', req.body);
  
    
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        console.log('❌ [CONTROLLER] No admin authenticated');
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { feedbackId } = req.params as { feedbackId: string };
      const { status } = req.body;

      console.log(`  🔄 Processing: feedbackId=${feedbackId}, newStatus=${status}, adminId=${adminId}`);

      if (!status) {
        console.log('❌ [CONTROLLER] No status provided in body');
        return res.status(400).json({
          success: false,
          message: "Status is required"
        });
      }

      console.log('  📞 Calling AdminFeedbackService.updateFeedbackStatus...');
      const result = await AdminFeedbackService.updateFeedbackStatus(feedbackId, status, adminId);
      
      console.log('  📦 Service result:', {
        success: result.success,
        message: result.message,
        hasData: !!result.data
      });
      
      if (!result.success) {
        console.log('❌ [CONTROLLER] Service returned error');
        return res.status(400).json(result);
      }

      console.log('✅✅✅ [CONTROLLER] Status update successful! ✅✅✅');
      console.log('═══════════════════════════════════════════════════');
      return res.json(result);

    } catch (error: any) {
      console.error('💥💥💥 [CONTROLLER] updateFeedbackStatus ERROR:', error);
      console.log('═══════════════════════════════════════════════════');
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== DELETE FEEDBACK ==========
  static async deleteFeedback(req: AdminAuthRequest, res: Response) {
    console.log('═══════════════════════════════════════════════════');
    console.log('🗑️🗑️🗑️ [CONTROLLER] deleteFeedback - START 🗑️🗑️🗑️');
    console.log('═══════════════════════════════════════════════════');
    console.log('  📍 Params:', req.params);
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        console.log('❌ [CONTROLLER] No admin authenticated');
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { feedbackId } = req.params as { feedbackId: string };
      console.log(`  🗑️ Processing delete: feedbackId=${feedbackId}, adminId=${adminId}`);

      console.log('  📞 Calling AdminFeedbackService.deleteFeedback...');
      const result = await AdminFeedbackService.deleteFeedback(feedbackId, adminId);
      
      console.log('  📦 Service result:', {
        success: result.success,
        message: result.message
      });

      if (!result.success) {
        console.log('❌ [CONTROLLER] Service returned error');
        return res.status(400).json(result);
      }

      console.log('✅✅✅ [CONTROLLER] Delete successful! ✅✅✅');
      console.log('═══════════════════════════════════════════════════');
      return res.json(result);

    } catch (error: any) {
      console.error('💥💥💥 [CONTROLLER] deleteFeedback ERROR:', error);
      console.log('═══════════════════════════════════════════════════');
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET FEEDBACK STATS ==========
  static async getFeedbackStats(req: AdminAuthRequest, res: Response) {
    console.log('🎯 [CONTROLLER] getFeedbackStats - START');
    
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        console.log('❌ [CONTROLLER] No admin authenticated');
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      console.log('  📞 Calling AdminFeedbackService.getFeedbackStats...');
      const result = await AdminFeedbackService.getFeedbackStats();
      
      console.log('  📊 Stats:', result.data);
      console.log('🎯 [CONTROLLER] getFeedbackStats - END');

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error('💥 [CONTROLLER] getFeedbackStats ERROR:', error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}