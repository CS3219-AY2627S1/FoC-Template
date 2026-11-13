import { Context, Router } from "@oak/oak";
import { authenticationMiddleware } from "../middleware/auth.ts";
import { getBalance, listTransactions, registerUser, createTransaction, releaseCredits, refundCredits } from "../controller/credits.ts";

const createPublicCreditRouter = () => {
    const router = new Router({ prefix: "/credits" });

    router.get(
        "/:id/balance", 
        authenticationMiddleware(new Set()), 
        async ctx => {
            await getBalance(ctx, Number(ctx.params.id));
        }
    );

    router.get(
        "/:id/transactions", 
        authenticationMiddleware(new Set()), 
        async ctx => {
            await listTransactions(ctx, Number(ctx.params.id));
        }
    );

    return router;
};

const createPrivateCreditRouter = () => {
    const router = new Router({ prefix: "/credits" });

    router.post(
        "/:id/register/",
        async ctx => {
            await registerUser(ctx, Number(ctx.params.id));
        }
    )

    router.post(
        "/holds",
        createTransaction
    )

    router.post(
        "/holds/:errandId/released",
        async ctx => {
            await releaseCredits(ctx, ctx.params.errandId);
        }
    )

    router.post(
        "/holds/:errandId/refunded",
        async ctx => {
            await refundCredits(ctx, ctx.params.errandId);
        }
    )

    return router;
};
export { createPublicCreditRouter, createPrivateCreditRouter };