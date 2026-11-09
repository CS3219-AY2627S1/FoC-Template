import { Router } from "express";
import { appealRejectionRecipient, changeUser, parseAdminChange, parseAdminSearch, parseAppealRejectionReason,
  requireAdministrator, searchUsers } from "../admin-users";
import { asyncHandler } from "../http";
import { createEmailSender, type EmailSender } from "../email";
import { config } from "../config";

export function createAdminUsersRouter(emailSender: EmailSender = createEmailSender(config.email)): Router {
  const router = Router();
  router.get("/search", asyncHandler(async (request, response) => {
    const actor = await requireAdministrator(request);
    response.set("Cache-Control", "no-store").json(await searchUsers(actor, parseAdminSearch(request.query.q, request.query.page, request.query.status)));
  }));
  router.post("/:userId/appeal-rejected", asyncHandler(async (request, response) => {
    const actor = await requireAdministrator(request);
    const reason = parseAppealRejectionReason(request.body?.reason);
    const email = await appealRejectionRecipient(actor, request.params.userId);
    // Email is sent after releasing account locks. Admin retains its rejection
    // if this best-effort notification fails; no account state is changed here.
    await emailSender.sendAppealRejected(email, reason);
    response.set("Cache-Control", "no-store").json({ message: "Appeal rejection notification sent" });
  }));
  for (const kind of ["role", "status"] as const) {
    router.post(`/:userId/${kind}`, asyncHandler(async (request, response) => {
      const actor = await requireAdministrator(request);
      response.set("Cache-Control", "no-store").json(await changeUser(actor, request.params.userId, parseAdminChange(kind, request.body)));
    }));
  }
  return router;
}
