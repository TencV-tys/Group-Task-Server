

import { UserJwtUtils } from './../utils/user.jwtutils';

import { UserRole, UserRoleStatus,Gender } from "@prisma/client";
import prisma from "../prisma";
import { UserSignUpAuthTypes, UserLoginAuthTypes } from "../types/user.auth";
import { comparePassword, hashedPassword } from "../utils/shared.bcrypt";
export class UserServices{


static async signup(
    email: string,
    fullName: string,
    password: string,
    confirmPassword: string,
    avatarUrl?: string | null,
    gender?: string | null
): Promise<UserSignUpAuthTypes> {
    try {
        console.log("=== BACKEND SIGNUP START ===");
        console.log("Email:", email);
        console.log("FullName:", fullName);
        console.log("Gender received:", gender);
        console.log("Gender type:", typeof gender);
        
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

        // Validate gender if provided
        let genderEnum: Gender | null = null;
        if (gender) {
            const upperGender = gender.toUpperCase();
            const validGenders = Object.values(Gender) as string[];
            console.log("Valid genders:", validGenders);
            console.log("Received gender:", upperGender);
            
            if (validGenders.includes(upperGender)) {
                genderEnum = upperGender as Gender;
                console.log("Gender validated as:", genderEnum);
            } else {
                console.log("Gender validation failed");
                return {
                    success: false,
                    message: `Invalid gender. Must be one of: ${validGenders.join(', ')}`
                };
            }
        } else {
            console.log("No gender provided");
        }

        console.log("Checking for existing user...");
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

        console.log("Creating password hash...");
        const passwordHashed = await hashedPassword(password, 10);

        console.log("Creating user in database...");
        const user = await prisma.user.create({
            data: {
                fullName: fullName,
                email: email,
                passwordHash: passwordHashed,
                avatarUrl: avatarUrl ?? null,
                gender: genderEnum,
                role: UserRole.USER,
                roleStatus: UserRoleStatus.ACTIVE
            }
        });

        console.log("User created successfully! ID:", user.id);
        
        const token = UserJwtUtils.generateToken(user.id, user.email, user.role);

        console.log("=== BACKEND SIGNUP SUCCESS ===");
        return {
            success: true,
            message: "Sign up successfully",
            token,
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
        console.error("=== BACKEND SIGNUP ERROR ===");
        console.error("Error type:", e.constructor.name);
        console.error("Error message:", e.message);
        console.error("Error stack:", e.stack);
        
        // Check for specific Prisma errors
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


 static async login(email:string,password:string):Promise<UserLoginAuthTypes>{
     try{
            
            if(!email || !password){
                return{
                    success:false,
                    message:"All fields are required"
                }
            }

        const user = await prisma.user.findUnique({
            where:{email}
        });

        if(!user){
            return{
                success:false,
                message:"User not found"
            }
        } 
         
        const validPassword = await comparePassword(password,user.passwordHash);
          
        if(!validPassword){
            return{
                success:false,
                message:"Invalid Password"
            }
        }

        const userId = user.id as unknown as string;
        const token = UserJwtUtils.generateToken(userId,user.email,user.role);
          return{
             success:true,
             message:"Login Successfully",
             token,
             user:{
                id:userId,
                fullName:user.fullName,
                email:user.email,
                avatarUrl:user.avatarUrl,
                gender:user.gender as Gender | null ,
                role:user.role,
                roleStatus:user.roleStatus
             }
          }

     }catch(e:any){
        return{
            success:false,
            message:"Login Failed",
            error:e.message
        }
     }  

 }

}