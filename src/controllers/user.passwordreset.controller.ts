import { Request, Response } from 'express';
import { UserPasswordResetService } from '../services/user.passwordreset.services';

export class UserPasswordResetController {
  
  static async requestReset(req: Request, res: Response) {
    try {
      const { email } = req.body;
      
      const result = await UserPasswordResetService.requestPasswordReset(email);
      
      return res.json(result);
      
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to process request"
      });
    }
  }

  static async verifyToken(req: Request, res: Response) {
    try {
      const { token, email } = req.body;
      
      const result = await UserPasswordResetService.verifyResetToken(token, email);
      
      return res.json(result);
      
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to verify token"
      });
    }
  }

  static async resetPassword(req: Request, res: Response) {
    try {
      const { token, email, newPassword, confirmPassword } = req.body;
      
      const result = await UserPasswordResetService.resetPassword(
        token, 
        email, 
        newPassword, 
        confirmPassword
      );
      
      return res.json(result);
      
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: "Failed to reset password"
      });
    }
  }
}