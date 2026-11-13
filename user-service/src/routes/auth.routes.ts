import { Router } from "express";
import { register, resend, verify, login, logout } from "../controllers/auth.controller.ts";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/verify", verify);
authRouter.post("/verify/resend", resend);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
