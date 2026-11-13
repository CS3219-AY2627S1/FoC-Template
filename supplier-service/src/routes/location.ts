import { Router } from "@oak/oak";
import { authenticationMiddleware } from "../middleware/auth.ts";
import { Role } from "../common.ts";
import { validateBody } from "../middleware/schema.ts"
import { createLocationSchema } from "../schema/location.ts"
import { fetchAllLocations, deleteLocation, createLocation } from "../controller/location.ts";

const router = new Router({ prefix: "/locations" });

// fetch all locations
router.get(
    "/",
    authenticationMiddleware(new Set()),
    fetchAllLocations
);

// create a location, specify name in request body
router.post(
    "/",
    authenticationMiddleware(new Set([Role.Admin])),
    validateBody(createLocationSchema),
    createLocation
)

// delete a location, specified by id
router.delete(
    "/:id",
    authenticationMiddleware(new Set([Role.Admin])),
    async ctx => {
        await deleteLocation(ctx, Number(ctx.params.id))
    }
)

export default router;
