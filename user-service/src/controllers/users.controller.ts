import type { RequestHandler, Request } from "express";
import { authOf } from "../middleware/authenticate.ts";
import { changeAccountState, changePassword, deleteUser, getUser, grantAdministrator, listUsers, revokeAdministrator, updateProfile } from "../services/user.service.ts";

function targetId(req: Request): string {
    return String(req.params.id);
}

export const me: RequestHandler = (req, res) => {
    res.status(200).json(authOf(req).account);
};

export const updateMe: RequestHandler = async (req, res) => {
    res.status(200).json(await updateProfile(authOf(req).account.id, req.body));
}

export const changeMyPassword: RequestHandler = async (req, res) => {
    const { account, sessionId } = authOf(req);
    await changePassword(account.id, sessionId, req.body);
    res.status(204).end();
}

export const list: RequestHandler = async (req, res) => {
    res.status(200).json(await listUsers(req.query));
};

export const getOne: RequestHandler = async (req, res) => {
    res.status(200).json(await getUser(targetId(req)));
};

export const getName: RequestHandler = async (req, res) => {
    res.status(200).json((await getUser(targetId(req))).username);
};

export const update: RequestHandler = async (req, res) => {
    res.status(200).json(await updateProfile(targetId(req), req.body));
};

export const remove: RequestHandler = async (req, res) => {
    await deleteUser(targetId(req), authOf(req).account.id);
    res.status(204).end();
};

export const grantAdmin: RequestHandler = async (req, res) => {
    res.status(200).json(await grantAdministrator(targetId(req), authOf(req).account.id));
};

export const revokeAdmin: RequestHandler = async (req, res) => {
    res.status(200).json(await revokeAdministrator(targetId(req), authOf(req).account.id));
};

export const changeState: RequestHandler = async (req, res) => {
    res.status(200).json(await changeAccountState(targetId(req), authOf(req).account.id, req.body));
};