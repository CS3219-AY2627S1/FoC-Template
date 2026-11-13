import { Router } from "express";
import { changeMyPassword, changeState, getName, getOne, grantAdmin, list, me, remove, revokeAdmin, update, updateMe } from "../controllers/users.controller.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireRole } from "../middleware/requireRole.ts";

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get("/name/:id", getName);
usersRouter.get("/me", me);
usersRouter.patch("/me", updateMe);
usersRouter.put("/me/password", changeMyPassword);

const adminOnly = requireRole("administrator");
usersRouter.get("/", adminOnly, list);
usersRouter.get("/:id", adminOnly, getOne);
usersRouter.patch("/:id", adminOnly, update);
usersRouter.delete("/:id", adminOnly, remove);
usersRouter.put("/:id/roles/administrator", adminOnly, grantAdmin);
usersRouter.delete("/:id/roles/administrator", adminOnly, revokeAdmin);
usersRouter.put("/:id/state", adminOnly, changeState);