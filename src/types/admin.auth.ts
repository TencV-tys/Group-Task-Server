import { SystemAdminRole } from '@prisma/client';


export interface AdminLoginAuthTypes{
 success:boolean;
 message:string;
 token?:string;
 admin?:{
        id:string;
        fullName:string;
        email:string;
        role:SystemAdminRole;
        isActive:boolean;
        lastLoginAt: Date | null;
 };
 error?:string;



}