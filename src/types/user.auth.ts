import { UserRole, UserRoleStatus } from "@prisma/client";

export interface UserAuthTypes{
success:boolean;
message:string;
token?:string;
user?:{
    id:string;
    name:string;
    email:string;
    passwordHash:string;
    avatarUrl?:string | null;
    phone?:string | null;
    role:UserRole;
    roleStatus:UserRoleStatus;
};
error?:string;



}