import prisma from "../prisma";
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { hashedPassword } from "../utils/shared.bcrypt";

// Create transporter with your Gmail settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Add these for better debugging
  tls: {
    rejectUnauthorized: false // Only for development
  }
});

export class UserPasswordResetService {
  
  static async requestPasswordReset(email: string) {
    try {
      console.log("📧 Password reset requested for:", email);
      
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
        console.log("User not found, but returning success for security");
        return {
          success: true,
          message: "If your email is registered, you will receive a password reset link"
        };
      }

      console.log("User found:", user.email);

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      // Hash token before storing
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
 
      console.log("Reset token stored in database");

      // Create reset URL
        const resetUrl = `http://192.168.1.29:5000/reset-password-form?token=${resetToken}&email=${email}`;
      console.log("Reset URL generated:", resetUrl);

      // Email content
      const mailOptions = {
        from: `"GroupTask App" <${process.env.SMTP_USER}>`, // Use your Gmail as sender
        to: email,
        subject: "🔐 Password Reset Request - GroupTask",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #333; margin: 0;">🔄 Password Reset</h1>
              </div>
              
              <p style="font-size: 16px; color: #555; line-height: 1.5;">Hello <strong>${user.fullName}</strong>,</p>
              
              <p style="font-size: 16px; color: #555; line-height: 1.5;">We received a request to reset your password for your GroupTask account. Click the button below to proceed:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background-color: #007AFF; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">Reset Password</a>
              </div>
              
              <p style="font-size: 14px; color: #777; line-height: 1.5;">Or copy this link to your browser:</p>
              <p style="font-size: 12px; color: #999; word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 5px;">${resetUrl}</p>
              
              <div style="border-top: 1px solid #eee; margin: 30px 0 20px; padding-top: 20px;">
                <p style="font-size: 13px; color: #999; margin: 5px 0;">⏰ This link will expire in <strong>1 hour</strong>.</p>
                <p style="font-size: 13px; color: #999; margin: 5px 0;">⚠️ If you didn't request this, please ignore this email or contact support.</p>
                <p style="font-size: 13px; color: #999; margin: 5px 0;">📍 This is an automated message, please do not reply.</p>
              </div>
              
              <div style="text-align: center; margin-top: 20px;">
                <p style="font-size: 12px; color: #aaa;">© ${new Date().getFullYear()} GroupTask. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        // Plain text version for email clients that don't support HTML
        text: `
          Password Reset Request
          
          Hello ${user.fullName},
          
          We received a request to reset your password.
          
          Click this link to reset: ${resetUrl}
          
          This link expires in 1 hour.
          
          If you didn't request this, please ignore this email.
        ` 
      };

      console.log("Attempting to send email...");

      // Send email
      const info = await transporter.sendMail(mailOptions);
      
      console.log("✅ Email sent successfully!");
      console.log("Message ID:", info.messageId);
      console.log("Response:", info.response);

      return {
        success: true,
        message: "If your email is registered, you will receive a password reset link"
      };

    } catch (error: any) {
      console.error("❌ Password reset request error:", error);
      
      // More detailed error logging
      if (error.code === 'EAUTH') {
        console.error("Authentication failed - check your Gmail app password");
      } else if (error.code === 'ESOCKET') {
        console.error("Socket error - check your network connection");
      }
      
      return {
        success: false,
        message: "Failed to process password reset request. Please try again later."
      };
    }
  }

  // Verify reset token
static async verifyResetToken(token: string, email: string) {
  console.log("========== BACKEND VERIFY TOKEN ==========");
  console.log("📧 Email:", email);
  console.log("🔑 Raw token:", token);
  
  try {
    if (!token || !email) {
      console.log("❌ Missing token or email");
      return {
        success: false,
        message: "Token and email are required"
      };
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    console.log("🔐 Hashed token:", hashedToken);
    console.log("⏰ Current time:", new Date().toISOString());

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
      console.log("❌ No user found with valid token");
      
      // Check if token exists but is expired
      const expiredUser = await prisma.user.findFirst({
        where: {
          email,
          resetPasswordToken: hashedToken,
          resetPasswordExpires: {
            lt: new Date()
          }
        }
      });
      
      if (expiredUser) {
        console.log("⏰ Token found but EXPIRED at:", expiredUser.resetPasswordExpires);
        return {
          success: false,
          message: "Reset link has expired. Please request a new one."
        };
      }
      
      // Check if email exists at all
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });
      
      if (!existingUser) {
        console.log("❌ No user found with email:", email);
        return {
          success: false,
          message: "Invalid reset token"
        };
      }
      
      console.log("❌ Token doesn't match for this user");
      return {
        success: false,
        message: "Invalid reset token"
      };
    }

    console.log("✅ Token is valid for user:", user.id);
    console.log("⏰ Token expires at:", user.resetPasswordExpires);
    
    return {
      success: true,
      message: "Token is valid",
      userId: user.id
    };

  } catch (error: any) {
    console.error("❌ Error in verifyResetToken:", error);
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