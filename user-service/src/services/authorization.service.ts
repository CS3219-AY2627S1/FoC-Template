import { fieldErrorsOf, validationError } from "../lib/validation.ts";
import { AuthorizeBody } from "../schemas/users.schemas.ts";
import { resolveSession } from "./session.service.ts";

export type AuthorizationDecision =
    | { decision: "authorized"; accountId: string, roles: string[] }
    | { decision: "denied" };

// the calling service names the role its operation needs
// this service decides whether the session's account is Active and holds it.
export async function authorize(input: unknown): Promise<AuthorizationDecision> {
    const parsed = AuthorizeBody.safeParse(input);
    if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
    const { token, requiredRole } = parsed.data;

    const auth = await resolveSession(token);
    if (!auth || !auth.account.roles.includes(requiredRole)) {
        return { decision: "denied" };
    } 

    return { decision: "authorized", accountId: auth.account.id, roles: auth.account.roles };
}