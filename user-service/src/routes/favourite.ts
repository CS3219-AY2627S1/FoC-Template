import { Router, type RouterContext } from "@oak/oak";
import { addFavouriteSchema, FavouriteController, updateFavouriteSchema } from "../controller/favourite.ts";
import { authenticationMiddleware } from "../middleware/auth.ts";
import { validateBody } from "../middleware/schema.ts";
import { repoFactory } from "../prisma/factory.ts";
import { db } from "../prisma/db.ts";

const { favourite } = repoFactory.buildRepos(db);
const favouriteController = new FavouriteController(favourite);

// the signed-in user's own bookmarks; the user always comes from the access token
const createFavouriteRouter = () => {
    const router = new Router({ prefix: "/favourite" });

    router.get("/", authenticationMiddleware(new Set()), async ctx => {
        // HACK: ctx typing seems to break only in root path
        await favouriteController.listFavourites(ctx as RouterContext<"/">);
    });

    router.post("/", authenticationMiddleware(new Set()), validateBody(addFavouriteSchema), async ctx => {
        await favouriteController.addFavourite(ctx as RouterContext<"/">);
    });

    router.patch("/:id", authenticationMiddleware(new Set()), validateBody(updateFavouriteSchema), async ctx => {
        await favouriteController.updateFavourite(ctx);
    });

    router.delete("/:id", authenticationMiddleware(new Set()), async ctx => {
        await favouriteController.removeFavourite(ctx);
    });

    return router;
};

export default createFavouriteRouter;
