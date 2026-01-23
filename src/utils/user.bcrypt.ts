import bcrypt from 'bcryptjs';

export const hashedPassword = async (password:string,saltRounds:number=10):Promise<string> =>{
      
    return await bcrypt.hash(password,10);

}

export const comparePassword = async (password:string,userPassword:string):Promise<boolean> => {
  
    return await bcrypt.compare(password,userPassword);

}