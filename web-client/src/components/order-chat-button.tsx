import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { chatService } from "../api/chat-service";
import { isApiRequestError } from "../api/client";
import { useAuth } from "../app/use-auth";
import { MessagesIcon } from "./navigation-icons";

export function OrderChatButton({ recipientUserId, recipientRole }: { recipientUserId: string; recipientRole: "requester" | "courier" }) {
  const { withCurrentAccess } = useAuth();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string>();
  const busy = useRef(false), version = useRef(0);
  useEffect(() => () => { version.current++; }, []);

  async function open() {
    if (busy.current) return;
    busy.current = true;
    const request = ++version.current;
    setOpening(true); setError(undefined);
    try {
      const conversation = await withCurrentAccess((token) => chatService.open(recipientUserId, token));
      if (request === version.current) navigate(`/messages/${encodeURIComponent(conversation.conversationId)}`);
    } catch (failure) {
      if (request === version.current) setError(isApiRequestError(failure) && failure.status >= 400 && failure.status < 500
        ? failure.message : "Messages are temporarily unavailable. Try opening the conversation again.");
    } finally {
      if (request === version.current) { busy.current = false; setOpening(false); }
    }
  }

  const label = opening ? "Opening conversation…" : `Message ${recipientRole}`;
  return <>
    <button aria-busy={opening} aria-label={label} className="order-chat-button" disabled={opening} onClick={() => void open()} title={label} type="button"><MessagesIcon /></button>
    {error ? <p className="order-chat-error" role="alert">{error}</p> : null}
  </>;
}
