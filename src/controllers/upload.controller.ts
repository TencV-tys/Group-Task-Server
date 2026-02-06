// src/controllers/uploadController.ts
import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../prisma';
import { UserAuthRequest } from '../middlewares/user.auth.middleware';

export class UploadController {
  // Helper to get public URL for file
  static getFileUrl(req: UserAuthRequest, filename: string, uploadType: string): string {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    if (uploadType === 'avatar') {
      return `${baseUrl}/uploads/avatars/${filename}`;
    } else if (uploadType === 'task_photo') {
      return `${baseUrl}/uploads/task-photos/${filename}`;
    }
    return `${baseUrl}/uploads/${filename}`;
  }

  // Helper to delete old file - FIXED
  static deleteOldFile(oldUrl: string | null): void {
    if (!oldUrl) return;
    
    try {
      const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
      
      // Check if URL contains our base URL
      if (oldUrl.includes(baseUrl)) {
        // Extract relative path after base URL
        const urlWithoutProtocol = oldUrl.replace(/^https?:\/\//, '');
        const baseUrlWithoutProtocol = baseUrl.replace(/^https?:\/\//, '');
        
        let relativePath = '';
        if (urlWithoutProtocol.startsWith(baseUrlWithoutProtocol)) {
          relativePath = urlWithoutProtocol.substring(baseUrlWithoutProtocol.length);
        } else {
          // Try different approach - extract path after uploads
          const uploadsIndex = oldUrl.indexOf('/uploads/');
          if (uploadsIndex !== -1) {
            relativePath = oldUrl.substring(uploadsIndex);
          } else {
            console.log('Could not extract relative path from URL:', oldUrl);
            return;
          }
        }
        
        const filePath = path.join(__dirname, '../..', relativePath);
        
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`✓ Deleted old file: ${filePath}`);
        } else {
          console.log(`File not found: ${filePath}`);
        }
      } else {
        console.log('URL does not match base URL:', oldUrl);
      }
    } catch (error: any) {
      console.error('Error deleting old file:', error.message);
    }
  }

  // Upload avatar - FIXED with better error handling
  static async uploadAvatar(req: UserAuthRequest, res: Response) {
    try {
      console.log('Upload avatar request received');
      
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized - No user ID found'
        });
      }

      console.log('User ID:', userId);
      console.log('File:', req.file);

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      // Get file info
      const filename = req.file.filename;
      const fileUrl = this.getFileUrl(req, filename, 'avatar');

      console.log('New file URL:', fileUrl);

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Delete old avatar if exists
      if (existingUser.avatarUrl) {
        console.log('Deleting old avatar:', existingUser.avatarUrl);
        this.deleteOldFile(existingUser.avatarUrl);
      }

      // Update user with new avatar URL
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: fileUrl },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          gender: true
        }
      });

      console.log('User updated successfully');

      return res.status(200).json({
        success: true,
        message: 'Avatar uploaded successfully',
        data: {
          avatarUrl: fileUrl,
          user: updatedUser
        }
      });

    } catch (error: any) {
      console.error('Avatar upload error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload avatar'
      });
    }
  }

  // Upload task completion photo - FIXED
  static async uploadTaskPhoto(req: UserAuthRequest, res: Response) {
    try {
      console.log('Upload task photo request received');
      
      const { taskId } = req.params as {taskId:string};
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      console.log('Task ID:', taskId, 'User ID:', userId);

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No photo uploaded'
        });
      }

      const filename = req.file.filename;
      const fileUrl = this.getFileUrl(req, filename, 'task_photo');

      console.log('New photo URL:', fileUrl);

      // Find the latest assignment for this task and user
      const assignment = await prisma.assignment.findFirst({
        where: {
          taskId: taskId,
          userId: userId,
          completed: false
        },
        orderBy: {
          dueDate: 'desc'
        }
      });

      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'No active assignment found for this task'
        });
      }

      console.log('Found assignment:', assignment.id);

      // Delete old photo if exists
      if (assignment.photoUrl) {
        console.log('Deleting old photo:', assignment.photoUrl);
        this.deleteOldFile(assignment.photoUrl);
      }

      // Update assignment with photo URL
      const updatedAssignment = await prisma.assignment.update({
        where: { id: assignment.id },
        data: { 
          photoUrl: fileUrl,
          verified: true
        }
      });

      console.log('Assignment updated successfully');

      return res.status(200).json({
        success: true,
        message: 'Task photo uploaded successfully',
        data: {
          photoUrl: fileUrl,
          assignment: {
            id: updatedAssignment.id,
            verified: updatedAssignment.verified,
            completed: updatedAssignment.completed
          }
        }
      });

    } catch (error: any) {
      console.error('Task photo upload error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload task photo'
      });
    }
  }

  // Delete avatar - FIXED
  static async deleteAvatar(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.avatarUrl) {
        return res.status(404).json({
          success: false,
          message: 'No avatar found to delete'
        });
      }

      console.log('Deleting avatar:', user.avatarUrl);
      
      // Delete file from server
      this.deleteOldFile(user.avatarUrl);

      // Update user to remove avatar URL
      await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: null }
      });

      return res.status(200).json({
        success: true,
        message: 'Avatar deleted successfully'
      });

    } catch (error: any) {
      console.error('Delete avatar error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete avatar'
      });
    }
  }

  // Upload from base64 - FIXED with directory creation
  static async uploadAvatarBase64(req: UserAuthRequest, res: Response) {
    try {
      console.log('Base64 avatar upload request received');
      
      const userId = req.user?.id;
      const { avatarBase64 } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      if (!avatarBase64) {
        return res.status(400).json({
          success: false,
          message: 'No base64 image provided'
        });
      }

      console.log('Base64 string length:', avatarBase64.length);

      // Decode base64 and save as file
      const matches = avatarBase64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({
          success: false,
          message: 'Invalid base64 image format. Expected format: data:image/type;base64,...'
        });
      }

      const imageType = matches[1].toLowerCase(); // jpeg, png, etc
      const imageBuffer = Buffer.from(matches[2], 'base64');

      // Check file size (max 5MB)
      if (imageBuffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: 'Image size exceeds 5MB limit'
        });
      }

      // Ensure avatars directory exists
      const avatarsDir = path.join(__dirname, '../../uploads/avatars');
      if (!fs.existsSync(avatarsDir)) {
        fs.mkdirSync(avatarsDir, { recursive: true });
        console.log('Created avatars directory:', avatarsDir);
      }

      // Generate filename
      const timestamp = Date.now();
      const filename = `${userId}-${timestamp}.${imageType}`;
      const filePath = path.join(avatarsDir, filename);

      console.log('Saving file to:', filePath);

      // Save file
      fs.writeFileSync(filePath, imageBuffer);

      // Get file URL
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const fileUrl = `${baseUrl}/uploads/avatars/${filename}`;

      console.log('File URL:', fileUrl);

      // Delete old avatar if exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true }
      });

      if (user?.avatarUrl) {
        console.log('Deleting old avatar:', user.avatarUrl);
        this.deleteOldFile(user.avatarUrl);
      }

      // Update user with new avatar URL
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: fileUrl },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          gender: true
        }
      });

      console.log('User updated successfully');

      return res.status(200).json({
        success: true,
        message: 'Avatar uploaded successfully',
        data: {
          avatarUrl: fileUrl,
          user: updatedUser
        }
      });

    } catch (error: any) {
      console.error('Base64 avatar upload error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload avatar'
      });
    }
  }
}