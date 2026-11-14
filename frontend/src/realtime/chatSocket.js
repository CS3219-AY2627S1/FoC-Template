/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Connected the team-specified chat socket path, room events and message updates.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Updated or tested chat bubbles, navigation and live read indicators.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Added the team-specified message:translated listener.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { getAccessToken, refreshAccessToken } from "../api/http";

const rooms = new Map();
const roomErrors = new Map();
const eventListeners = new Set();
const readyListeners = new Set();
const readListeners = new Set();
const translatedListeners = new Set();
let socket = null;
let authRetried = false;
let retryTimer = null;

const expiryMs = (token) => {
  try {
    const claims = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof claims.exp === "number" ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
};

// The in-memory token, unless it is missing or about to expire (the server would drop us at once).
async function handshakeToken() {
  const token = getAccessToken();
  if (token && expiryMs(token) - Date.now() > 30_000) return token;
  return refreshAccessToken();
}

export function connectChatSocket() {
  if (socket) return;
  socket = io({
    path: "/chat-socket.io",
    transports: ["websocket"], // the server accepts websocket only
    autoConnect: false,
    auth: (cb) => {
      handshakeToken().then(
        (token) => cb({ token }),
        () => cb({ token: null }),
      );
    },
  });

  socket.on("messsage:read", (receipt) =>
    readListeners.forEach((listener) => listener(receipt)),
  );
  socket.on("message:translated", (translated) =>
    translatedListeners.forEach((listener) => listener(translated)),
  );
  socket.on("message:sent", (message) =>
    eventListeners.forEach((listener) => listener(message)),
  );

  // Rejoin chats still open in the UI after the authenticated user room is ready.
  socket.on("ready", () => {
    authRetried = false;
    rooms.forEach((_, id) => joinRoom(id));
    readyListeners.forEach((listener) => listener());
  });

  // The server disconnects at token expiry and does not reconnect by itself; the auth callback
  // fetches a new token for the next handshake.
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") socket.connect();
  });

  socket.on("connect_error", (err) => {
    if (socket.active) return; // transport failure: socket.io retries with backoff on its own
    clearTimeout(retryTimer);
    if (err.message === "unauthorized" && !authRetried) {
      authRetried = true;
      refreshAccessToken().then(
        () => socket?.connect(),
        () => {}, // session gone: the next login connects again
      );
    } else if (err.message === "identity_provider_unavailable") {
      retryTimer = setTimeout(() => socket?.connect(), 5000);
    }
  });

  socket.connect();
}

export function disconnectChatSocket() {
  clearTimeout(retryTimer);
  socket?.disconnect();
  socket = null;
  authRetried = false;
}

function joinRoom(id) {
  socket?.emit("chat:join", id, (result) => {
    if (rooms.has(id))
      roomErrors
        .get(id)
        ?.forEach((listener) =>
          listener(result.success ? null : result.error.message),
        );
  });
}
export function useChatRoom(id, onError) {
  const latest = useRef(onError);
  latest.current = onError;
  useEffect(() => {
    const error = (message) => latest.current?.(message);
    rooms.set(id, (rooms.get(id) ?? 0) + 1);
    if (!roomErrors.has(id)) roomErrors.set(id, new Set());
    roomErrors.get(id).add(error);
    if (socket?.connected) joinRoom(id);
    return () => {
      roomErrors.get(id)?.delete(error);
      const count = (rooms.get(id) ?? 1) - 1;
      if (count) rooms.set(id, count);
      else {
        rooms.delete(id);
        roomErrors.delete(id);
        if (socket?.connected) socket.emit("chat:leave", id, () => {});
      }
    };
  }, [id]);
}
export function useChatMessages(handler) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener = (message) => latest.current(message);
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  }, []);
}
export function useChatReady(handler) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener = () => latest.current();
    readyListeners.add(listener);
    return () => readyListeners.delete(listener);
  }, []);
}

export function useChatReads(handler) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener = (receipt) => latest.current(receipt);
    readListeners.add(listener);
    return () => readListeners.delete(listener);
  }, []);
}

// AI-generated (edited by <name>).
export function useChatTranslations(handler) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const listener = (translated) => latest.current(translated);
    translatedListeners.add(listener);
    return () => translatedListeners.delete(listener);
  }, []);
}
