import { UserRole, UserRoleStatus } from "@prisma/client";

export interface UserSignUpAuthTypes{
success:boolean;
message:string;
token?:string;
user?:{
    id:string;
    fullName:string;
    email:string;
    passwordHash:string;
    avatarUrl?:string | null;
    gender?:string | null;
    role:UserRole;
    roleStatus:UserRoleStatus;
};
error?:string;



}


export interface UserLoginAuthTypes{
success:boolean;
message:string;
token?:string;
user?:{
    id:string;
    fullName:string;
    email:string;
    avatarUrl?:string | null;
    gender?:string | null;
    role:UserRole;
    roleStatus:UserRoleStatus;
};
error?:string;



}