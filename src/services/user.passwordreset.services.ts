import prisma from "../prisma";
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { hashedPassword } from "../utils/shared.bcrypt";

// Create transporter for sending emails
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export class UserPasswordResetService {
  
  // Generate reset token and send email
  static async requestPasswordReset(email: string) {
    try {
      if (!email) {
        return {
          success: false,
          message: "Email is required"
        }; 
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        // For security, don't reveal if user exists
        return {
          success: true,
          message: "If your email is registered, you will receive a password reset link"
        };
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

      // Hash token before storing (for security)
      const hashedToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

      // Store token in database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: resetTokenExpiry
        }
      });

      // Create reset URL (you'll need to handle this in your app)
      const resetUrl = `${process.env.APP_URL || 'exp://localhost:19000'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

      // Send email
      const mailOptions = {
        from: `"Your App Name" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: email,
        subject: "Password Reset Request",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Password Reset Request</h2>
            <p>Hello ${user.fullName},</p>
            <p>You requested to reset your password. Click the button below to proceed:</p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007AFF; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">Reset Password</a>
            <p>Or copy this link: ${resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
            <hr>
            <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);

      return {
        success: true,
        message: "If your email is registered, you will receive a password reset link"
      };

    } catch (error: any) {
      console.error("Password reset request error:", error);
      return {
        success: false,
        message: "Failed to process password reset request"
      };
    }
  }

  // Verify reset token
  static async verifyResetToken(token: string, email: string) {
    try {
      if (!token || !email) {
        return {
          success: false,
          message: "Token and email are required"
        };
      }

      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      const user = await prisma.user.findFirst({
        where: {
          email,
          resetPasswordToken: hashedToken,
          resetPasswordExpires: {
            gt: new Date()
          }
        }
      });

      if (!user) {
        return {
          success: false,
          message: "Invalid or expired reset token"
        };
      }

      return {
        success: true,
        message: "Token is valid",
        userId: user.id
      };

    } catch (error: any) {
      return {
        success: false,
        message: "Failed to verify token"
      };
    }
  }

  // Reset password
  static async resetPassword(token: string, email: string, newPassword: string, confirmPassword: string) {
    try {
      if (!token || !email || !newPassword || !confirmPassword) {
        return {
          success: false,
          message: "All fields are required"
        };
      }

      if (newPassword !== confirmPassword) {
        return {
          success: false,
          message: "Passwords do not match"
        };
      }

      if (newPassword.length < 6) {
        return {
          success: false,
          message: "Password must be at least 6 characters"
        };
      }

      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      const user = await prisma.user.findFirst({
        where: {
          email,
          resetPasswordToken: hashedToken,
          resetPasswordExpires: {
            gt: new Date()
          }
        }
      });

      if (!user) {
        return {
          success: false,
          message: "Invalid or expired reset token"
        };
      }

      // Hash new password
      const hashedNewPassword = await hashedPassword(newPassword, 10);

      // Update password and clear reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashedNewPassword,
          resetPasswordToken: null,
          resetPasswordExpires: null
        }
      });

      // Optionally send confirmation email
      await transporter.sendMail({
        from: `"Your App Name" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Password Reset Successful",
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Password Reset Successful</h2>
            <p>Hello ${user.fullName},</p>
            <p>Your password has been successfully reset.</p>
            <p>If you didn't make this change, please contact support immediately.</p>
          </div>
        `
      });

      return {
        success: true,
        message: "Password reset successful"
      };

    } catch (error: any) {
      console.error("Reset password error:", error);
      return {
        success: false,
        message: "Failed to reset password"
      };
    }
  }
}