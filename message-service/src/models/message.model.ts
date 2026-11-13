import { Schema, model } from "mongoose";

export const STATUS = ["read", "unread"] as const;
export const SYSTEM_SENDER_ID = "0";

const messageSchema = new Schema(
    {
        senderId: { type: String, required: true, minlength: 1, trim: true },
        receiverId: { type: String, required: true, trim: true },
        // The errand the chat belongs to. Only the welcome message from Relay has none.
        orderId: { type: String, trim: true },
        content: { type: String, required: true, trim: true },
        status: { type: String, enum: STATUS, default: "unread" },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ receiverId: 1, status: 1 });
messageSchema.index({ orderId: 1, createdAt: -1, _id: -1 });
messageSchema.index({ receiverId: 1 }, { unique: true, partialFilterExpression: { senderId: SYSTEM_SENDER_ID } });

const Message = model("Message", messageSchema);

export default Message;
