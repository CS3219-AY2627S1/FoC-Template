import { Router, type RouterContext } from "@oak/oak";
import { UserController, listUsersQuerySchema, userUpdateBasicSchema, userUpdatePasswordSchema, userUpdateRoleSchema } from "../controller/user.ts"
import { authenticationMiddleware, currentRolesMiddleware } from "../middleware/auth.ts";
import { validateBody, validateQuery } from "../middleware/schema.ts";
import { Role } from "../prisma/common.ts";
import { defaultHasher } from "../util/hash.ts";
import { repoFactory } from "../prisma/factory.ts";
import { db } from "../prisma/db.ts";

const { user, role } = repoFactory.buildRepos(db);
const userController = new UserController(user, role, defaultHasher);
// role and suspension changes also check the caller's current roles in the database,
// so a token issued before the caller was demoted or suspended no longer works for them
const currentAdmin = currentRolesMiddleware(user, new Set([Role.Admin]));
const createUserRouter = () => {
    const router = new Router({ prefix: "/user" });

    router.get("/", authenticationMiddleware(new Set([Role.Admin])), validateQuery(listUsersQuerySchema), async ctx => {
        // HACK: ctx typing seems to break only in root path
        await userController.listUsers(ctx as RouterContext<"/">);
    });

    router.get("/:id", authenticationMiddleware(new Set()), async ctx => {
        await userController.getUser(ctx);
    });

    router.put(
        "/:id",
        authenticationMiddleware(new Set()),
        validateBody(userUpdateBasicSchema),
        async ctx => {
            await userController.updateUserBasic(ctx);
        }
    );

    router.patch(
        "/:id/role",
        authenticationMiddleware(new Set([Role.Admin])),
        currentAdmin,
        validateBody(userUpdateRoleSchema),
        async ctx => {
            await userController.updateUserRole(ctx);
        }
    );

    router.post(
        "/:id/change-password",
        authenticationMiddleware(new Set()),
        validateBody(userUpdatePasswordSchema),
        async ctx => {
            await userController.updateUserPassword(ctx);
        }
    );

    router.post(
        "/:id/suspend",
        authenticationMiddleware(new Set([Role.Admin])),
        currentAdmin,
        async ctx => {
            await userController.suspendUser(ctx);
        }
    );

    router.delete(
        "/:id/suspend",
        authenticationMiddleware(new Set([Role.Admin])),
        currentAdmin,
        async ctx => {
            await userController.unsuspendUser(ctx);
        }
    );

    return router;
};

export default createUserRouter;
