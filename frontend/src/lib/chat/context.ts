// AI-assisted (Claude Opus 5.5): React bindings for the chat controller. Reviewed by authors.
import { createContext, useContext, useSyncExternalStore } from "react";
import type { ChatController } from "./controller";
import type { ChatState } from "./store";

export const ChatContext = createContext<ChatController | null>(null);

/** The controller, or null before login (or while the profile is loading). */
export function useOptionalController(): ChatController | null {
  return useContext(ChatContext);
}

export function useController(): ChatController {
  const controller = useContext(ChatContext);
  if (!controller) throw new Error("useController outside a ready ChatProvider");
  return controller;
}

const NO_SUBSCRIPTION = () => () => {};

/**
 * Subscribe to a slice of chat state; `fallback` is returned while no controller
 * exists. The selector must return a stable reference (or a primitive).
 */
export function useChat<T>(selector: (s: ChatState) => T, fallback: T): T {
  const controller = useContext(ChatContext);
  return useSyncExternalStore(controller ? controller.store.subscribe : NO_SUBSCRIPTION, () =>
    controller ? selector(controller.store.get()) : fallback,
  );
}
