// import { Router, type RouterContext } from "@oak/oak";
// import SupplierRepo from "../prisma/suppliers.ts";
// import {
//     createSupplierSchema,
//     listSuppliersQuerySchema,
//     SupplierController,
//     updateSupplierSchema,
// } from "../controller/supplier.ts";
// import { authenticationMiddleware } from "../middleware/auth.ts";
// import { validateBody, validateQuery } from "../middleware/schema.ts";
// import { defaultOrderServiceClient } from "../util/orderService.ts";
// import { Role } from "../common.ts";

// const supplierController = new SupplierController(SupplierRepo, defaultOrderServiceClient);

// const createSupplierRouter = () => {
//     const router = new Router({ prefix: "/suppliers" });

//     // any signed-in user (requestor, courier or admin) can browse suppliers
//     router.get("/", authenticationMiddleware(new Set()), validateQuery(listSuppliersQuerySchema), async ctx => {
//         // HACK: ctx typing seems to break only in root path
//         await supplierController.listSuppliers(ctx as RouterContext<"/">);
//     });

//     router.get("/:id", authenticationMiddleware(new Set()), async ctx => {
//         await supplierController.getSupplier(ctx);
//     });

//     // only admins manage supplier records (FR 5)
//     router.post(
//         "/",
//         authenticationMiddleware(new Set([Role.Admin])),
//         validateBody(createSupplierSchema),
//         async ctx => {
//             await supplierController.createSupplier(ctx as RouterContext<"/">);
//         }
//     );

//     router.patch(
//         "/:id",
//         authenticationMiddleware(new Set([Role.Admin])),
//         validateBody(updateSupplierSchema),
//         async ctx => {
//             await supplierController.updateSupplier(ctx);
//         }
//     );

//     router.delete("/:id", authenticationMiddleware(new Set([Role.Admin])), async ctx => {
//         await supplierController.deleteSupplier(ctx);
//     });

//     return router;
// };

// // reachable only on the gateway's private listener, for other services (e.g. the
// // order service looking up the supplier of a past errand)
// export const createPrivateSupplierRouter = () => {
//     const router = new Router({ prefix: "/suppliers" });

//     router.get("/:id", async ctx => {
//         await supplierController.getSupplier(ctx, true);
//     });

//     return router;
// };

// export default createSupplierRouter;

// TODO: Attach request validation middleware.

import { Router } from "@oak/oak";
import { fetchAllSuppliers, fetchSupplier, createSupplier, updateSupplier, deleteSupplier } from "../controller/supplier.ts";
import { authenticationMiddleware } from "../middleware/auth.ts";
import { Role } from "../common.ts";
import { validateBody, validateQuery } from "../middleware/schema.ts";
import { createSupplierSchema, listSuppliersQuerySchema, updateSupplierSchema } from "../schema/supplier.ts";

const router = new Router({ prefix: "/suppliers" });

// get a page of live suppliers, optionally searched by name, filtered by location and sorted
router.get(
    "/",
    authenticationMiddleware(new Set()),
    validateQuery(listSuppliersQuerySchema),
    fetchAllSuppliers
);

// get a supplier with a specified id
router.get(
    "/:id",
    authenticationMiddleware(new Set()), 
    async ctx => {
        await fetchSupplier(ctx, Number(ctx.params.id))
    }
)

// create new supplier
router.post(
    "/", 
    authenticationMiddleware(new Set([Role.Admin])),
    validateBody(createSupplierSchema),
    createSupplier
)

// update some fields of supplier with specified id
router.patch(
    "/:id",
    authenticationMiddleware(new Set([Role.Admin])),
    validateBody(updateSupplierSchema),
    async ctx => {
    await updateSupplier(ctx, Number(ctx.params.id));
})

// delete supplier with specified id
router.delete(
    "/:id",
    authenticationMiddleware(new Set([Role.Admin])),
    async ctx => {
        await deleteSupplier(ctx, Number(ctx.params.id));
    }
)

export default router;
