import  express  from "express";
import dotenv from "dotenv";
import cookieParser from 'cookie-parser';
import cors from 'cors';
import UserAuthRoutes from './routes/user.auth.routes';
import AdminAuthRoutes from './routes/admin.auth.routes';

dotenv.config();

const svr = express();

svr.use(express.json());
svr.use(cors({
    origin:true,
    credentials:true
}));
svr.use(cookieParser());
svr.use(express.urlencoded({extended:true}));


svr.use('/api/auth/users',UserAuthRoutes);
svr.use('/api/admin/admins',AdminAuthRoutes);

const PORT = process.env.PORT || 5000;
svr.listen(PORT,()=>console.log(`Server running at http://localhost:${PORT}`));