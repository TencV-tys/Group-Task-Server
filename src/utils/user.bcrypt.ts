import bcrypt from 'bcryptjs';

export const hashedPassword = (password:string,length:number):string =>{
      
    return bcrypt.hash(password,10);

}

export const comparePassword = (password:string,userPassword:string):string => {
  
    return bcrypt.compare(password,userPassword);

}