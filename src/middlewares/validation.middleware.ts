// middlewares/validation.middleware.ts
import { Request, Response, NextFunction } from "express";
import prisma from "../prisma";

export const validateGroupId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { groupId } = req.params as {groupId:string};
  
  if (!groupId) {
    return res.status(400).json({
      success: false,
      message: "Group ID is required"
    });
  }

  // Check if group exists
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true }
  });

  if (!group) {
    return res.status(404).json({
      success: false,
      message: "Group not found"
    });
  }

  next();
};