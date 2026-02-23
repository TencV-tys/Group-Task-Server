// services/user.auth.services.ts
import { UserJwtUtils } from './../utils/user.jwtutils';
import { UserRole, UserRoleStatus, Gender } from "@prisma/client";
import prisma from "../prisma";
import { UserSignUpAuthTypes, UserLoginAuthTypes } from "../types/user.auth";
import { comparePassword, hashedPassword } from "../utils/shared.bcrypt";
import fs from 'fs';
import path from 'path';

export class UserServices {
  static async signup(
    email: string,
    fullName: string,
    password: string,
    confirmPassword: string,
    avatarData?: string | null,
    gender?: string | null
  ): Promise<UserSignUpAuthTypes> {
    try {
      console.log("UserServices.signup called with avatarData:", avatarData?.substring(0, 50) + "...");
      
      if (!email || !password || !confirmPassword || !fullName) {
        console.log("Validation failed: Missing fields");
        return {
          success: false,
          message: "All fields are required"
        };
      }

      if (password !== confirmPassword) {
        console.log("Validation failed: Passwords don't match");
        return {
          success: false,
          message: "Please confirm your password"
        };
      }

      let genderEnum: Gender | null = null;
      if (gender) {
        const upperGender = gender.toUpperCase();
        const validGenders = Object.values(Gender) as string[];
        
        if (validGenders.includes(upperGender)) {
          genderEnum = upperGender as Gender;
        } else {
          return {
            success: false,
            message: `Invalid gender. Must be one of: ${validGenders.join(', ')}`
          };
        }
      }

      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        console.log("Email already exists");
        return {
          success: false,
          message: "Email already registered"
        };
      }

      let avatarUrl: string | null = null;
      
      if (avatarData) {
        try {
          if (avatarData.startsWith('data:image')) {
            console.log("Processing base64 avatar...");
            avatarUrl = await this.saveBase64Image(avatarData, email);
          } else if (avatarData.startsWith('http')) {
            console.log("Using existing avatar URL...");
            avatarUrl = avatarData;
          } else {
            console.log("Invalid avatar data format");
          }
        } catch (avatarError: any) {
          console.error("Avatar processing failed:", avatarError.message);
        }
      }

      const passwordHashed = await hashedPassword(password, 10);

      const user = await prisma.user.create({
        data: {
          fullName: fullName,
          email: email,
          passwordHash: passwordHashed,
          avatarUrl: avatarUrl,
          gender: genderEnum,
          role: UserRole.USER,
          roleStatus: UserRoleStatus.ACTIVE
        }
      });

      const token = UserJwtUtils.generateToken(user.id, user.email, user.role);

      return {
        success: true,
        message: "Sign up successfully",
        token, // ← Token is here!
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          passwordHash: user.passwordHash,
          avatarUrl: user.avatarUrl,
          gender: user.gender as Gender | null,
          role: user.role,
          roleStatus: user.roleStatus
        }
      };

    } catch (e: any) {
      console.error("Signup error:", e);
      
      if (e.code) {
        console.error("Prisma error code:", e.code);
      }
      
      return {
        success: false,
        message: "Sign up failed: " + e.message,
        error: e.message
      };
    } 
  }

  private static async saveBase64Image(base64String: string, email: string): Promise<string | null> {
    try {
      const uploadsDir = path.join(__dirname, '../../uploads/avatars');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log("Created avatars directory:", uploadsDir);
      }

      const matches = base64String.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        console.log("Invalid base64 format");
        return null;
      }

      const imageType = matches[1]?.toLowerCase();
      const base64Data = matches[2];
      
      if (!imageType || !base64Data) {
        console.log("Invalid base64 data format");
        return null;
      }

      const imageBuffer = Buffer.from(base64Data, 'base64');

      if (imageBuffer.length > 5 * 1024 * 1024) {
        console.log("Image too large:", imageBuffer.length);
        return null;
      }

      const sanitizedEmail = email.replace(/[^a-zA-Z0-9]/g, '_');
      const timestamp = Date.now();
      const filename = `${sanitizedEmail}-${timestamp}.${imageType}`;
      const filePath = path.join(uploadsDir, filename);

      fs.writeFileSync(filePath, imageBuffer);
      console.log("Avatar saved to:", filePath);

      return `/uploads/avatars/${filename}`;

    } catch (error: any) {
      console.error("Error saving base64 image:", error.message);
      return null;
    }
  }

  static async login(email:string, password:string): Promise<UserLoginAuthTypes>{
    try{
      if(!email || !password){
        return {
          success: false,
          message: "All fields are required"
        };
      }

      const user = await prisma.user.findUnique({
        where: { email }
      });

      if(!user){
        return {
          success: false,
          message: "User not found"
        };
      } 
       
      const validPassword = await comparePassword(password, user.passwordHash);
        
      if(!validPassword){
        return {
          success: false,
          message: "Invalid Password"
        };
      }

      const userId = user.id as unknown as string;
      const token = UserJwtUtils.generateToken(userId, user.email, user.role);
      
      return {
        success: true,
        message: "Login Successfully",
        token, // ← Token is here!
        user: {
          id: userId,
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          gender: user.gender as Gender | null,
          role: user.role,
          roleStatus: user.roleStatus
        }
      };

    } catch(e:any){
      return {
        success: false,
        message: "Login Failed",
        error: e.message
      };
    }  
  }
}