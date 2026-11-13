import "dotenv/config";
import express, { type Express, type Request, type Response } from 'express';
import router from './routes/supplierRoutes.ts';
import dotenv from "dotenv";
import errorHandling from "./middleware/errorHandler.ts";
import cors from 'cors';

dotenv.config();

const app: Express = express();

const PORT = process.env.PORT || 3001

// Cropped image_url data URLs are base64 JPEG strings; keep headroom above the ~55kb crop target.
app.use(express.json({ limit: "5mb" }));

app.use(cors({ origin: process.env.CORS_ORIGIN }));

// Routes 
app.use('/api/suppliers/', router)

app.use(errorHandling)

app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});