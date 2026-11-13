import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from 'cors';
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { query } from "./config/db.js";
import errorMiddleware from "./middleware/errorMiddleware.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";

const app: Express = express();

app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN }))
app.use(cookieParser());

app.get("/health", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await query("SELECT 1");

    res.status(200).json({
      status: "UP",
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api", roleRoutes);

app.use(errorMiddleware);

app.listen(env.port, () => {
  console.log(`Server running on PORT ${env.port}`);
});