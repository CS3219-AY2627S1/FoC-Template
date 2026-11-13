// The retention job: deletes chats (with their messages and images) once their deletion time has
// passed, and tells anyone still looking at them. Run on a timer by src/index.ts.
import config from "../config.ts";
import log from "../log.ts";
import { deleteExpired } from "../prisma/chats.ts";
import { notifyDeleted } from "../realtime/events.ts";

export const runRetention = async (): Promise<number> => {
    const deleted = await deleteExpired(config.chat.staleSessionDays);
    for (const chat of deleted) {
        log.info(`Deleted chat for errand ${chat.errandId}`);
        notifyDeleted(chat.errandId, chat);
    }
    return deleted.length;
};
