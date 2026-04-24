// middlewares/group.status.middleware.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '../prisma';
import { GroupStatus } from '@prisma/client';

export async function checkGroupAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const groupId = req.params.groupId || req.body.groupId;
    
    if (!groupId) {
      return next();
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { status: true, isDeleted: true, name: true, statusReason: true }
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Block access to deleted groups
    if (group.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This group has been deleted.',
        code: 'GROUP_DELETED'
      });
    }

    // Block access to suspended groups
    if (group.status === GroupStatus.SUSPENDED) {
      return res.status(403).json({
        success: false,
        message: group.statusReason 
          ? `This group is suspended. Reason: ${group.statusReason}`
          : 'This group is suspended. Please contact support.',
        code: 'GROUP_SUSPENDED'
      });
    }

    next();
  } catch (error) {
    console.error('Error checking group access:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}