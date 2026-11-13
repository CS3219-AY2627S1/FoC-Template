import "dotenv/config";
import express, { type Express, type Request, type Response } from 'express';
import router from './routes/creditRoutes.ts';
import dotenv from "dotenv";
import errorHandling from "./middleware/errorHandler.ts";
import cors from 'cors';
import { connectAndConsume } from "./events/rabbitmq.ts";

dotenv.config();

const app: Express = express();

const PORT = process.env.PORT || 3001

app.use(express.json());

app.use(cors({ origin: process.env.CORS_ORIGIN }));

// Routes
app.use('/api/credit/', router)

app.use(errorHandling)

// Server
app.listen(PORT, async () => {
  console.log(`Server running on PORT ${PORT}`);
  await connectAndConsume();
});