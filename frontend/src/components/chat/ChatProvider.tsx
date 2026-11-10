// AI-assisted (Claude Opus 5.5): owns the chat controller for the logged-in user:
// connects after login, disconnects on logout, logs out if the session expired.
// Reviewed by authors.
import { notifications } from "@mantine/notifications";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { ChatContext } from "../../lib/chat/context";
import { ChatController } from "../../lib/chat/controller";

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [controller, setController] = useState<ChatController | null>(null);
  // Callbacks change identity on every render; the controller must not.
  const onAuthFailed = useRef(() => {});
  onAuthFailed.current = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      setController(null);
      return;
    }
    const chat = new ChatController(
      userId,
      () => onAuthFailed.current(),
      (title) =>
        notifications.show({
          color: "gray",
          title: "Chat closed",
          message: `You no longer have access to "${title}".`,
        }),
    );
    chat.start();
    setController(chat);
    return () => chat.stop();
  }, [userId]);

  return <ChatContext.Provider value={controller}>{children}</ChatContext.Provider>;
}
