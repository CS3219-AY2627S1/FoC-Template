import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { chatService, messageValidation, trimMessage, type ChatPerson, type ChatPage, type Conversation } from "../api/chat-service";
import { userService } from "../api/user-service";
import { useAuth } from "../app/use-auth";
import { ChatController, chatFailure, type DraftMessage } from "../chat/controller";
import { MessagesIcon } from "../components/navigation-icons";
import { WorkspaceShell } from "../components/workspace-shell";

const clock = new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit" });
const dateTime = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short" });
function Time({ value }: { value: string }) {
  return <time dateTime={value} title={dateTime.format(new Date(value))}>{clock.format(new Date(value))}</time>;
}
function Person({ person }: { person: ChatPerson }) {
  return <span className="chat-person"><strong>{person.accountStatus === "DELETED" ? "Deleted User" : person.displayName}</strong>{person.accountStatus === "ACTIVE" && person.username ? <small>@{person.username}</small> : null}</span>;
}
function Avatar({ name }: { name: string }) {
  return <span aria-hidden="true" className="chat-avatar">{name.slice(0, 1).toUpperCase()}</span>;
}
function ConversationRow({ item, selected }: { item: Conversation; selected: boolean }) {
  return <li><Link aria-current={selected ? "page" : undefined} className={`chat-conversation${selected ? " selected" : ""}`} to={`/messages/${item.conversationId}`}>
    <Avatar name={item.counterpart.displayName} />
    <span className="chat-conversation-copy"><Person person={item.counterpart} /><span className="chat-preview">{item.latestMessage?.text ?? "No messages yet"}</span></span>
    <span className="chat-conversation-meta">{item.latestMessage ? <Time value={item.latestMessage.createdAt} /> : null}{item.unreadCount ? <span className="chat-unread" aria-label={`${item.unreadCount} unread messages`}>{item.unreadCount}</span> : null}</span>
  </Link></li>;
}

export function MessagesPage() {
  const { user } = useAuth();
  return user ? <MessagesWorkspace key={user.userId} /> : null;
}

function MessagesWorkspace() {
  const auth = useAuth(), authRef = useRef(auth);
  authRef.current = auth;
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const userId = auth.user!.userId;
  const controller = useMemo(() => new ChatController(userId,
    (operation) => authRef.current.withCurrentAccess(operation),
    () => authRef.current.withCurrentAccess(async (token) => { await userService.getCurrentUser(token); return token; }),
  ), [userId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const selected = state.conversations.find((item) => item.conversationId === conversationId);
  const thread = conversationId ? state.threads[conversationId] : undefined;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<ChatPage<{ userId: string; username: string }> | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [searchRetry, setSearchRetry] = useState(0);
  const [opening, setOpening] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [blockBusy, setBlockBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<string>();
  const composer = useRef<HTMLTextAreaElement>(null);
  const focusComposerFor = useRef<string | undefined>(undefined);
  const scrollArea = useRef<HTMLDivElement>(null);
  const historyAnchor = useRef<{ conversationId: string; element: HTMLElement; top: number } | null>(null);
  const nearEnd = useRef(true);
  const searchVersion = useRef(0);
  const [focused, setFocused] = useState(() => document.visibilityState === "visible" && document.hasFocus());
  const text = conversationId ? drafts[conversationId] ?? "" : "";
  const blockedByMe = !!selected && state.blocks.some((person) => person.userId === selected.counterpart.userId);

  useEffect(() => { controller.start(); return () => controller.stop(); }, [controller]);
  useEffect(() => { controller.select(conversationId); setActionError(undefined); setValidation(undefined); }, [controller, conversationId]);
  useLayoutEffect(() => { nearEnd.current = true; historyAnchor.current = null; }, [conversationId]);
  useEffect(() => {
    const update = () => {
      const active = document.visibilityState === "visible" && document.hasFocus();
      controller.setActive(active); setFocused(active);
      if (active) controller.synchronize();
    };
    const online = () => { controller.transport.reconnect(); controller.synchronize(); };
    update();
    document.addEventListener("visibilitychange", update); window.addEventListener("focus", update); window.addEventListener("blur", update); window.addEventListener("online", online);
    return () => { document.removeEventListener("visibilitychange", update); window.removeEventListener("focus", update); window.removeEventListener("blur", update); window.removeEventListener("online", online); };
  }, [controller]);
  // This effect runs after history has been rendered, never as a side effect of fetching it.
  useEffect(() => {
    if (conversationId && focused) void controller.acknowledgeVisible(conversationId);
  }, [controller, conversationId, focused, thread]);
  useLayoutEffect(() => {
    const area = scrollArea.current, anchor = historyAnchor.current;
    if (!area || !thread?.loaded) return;
    if (anchor && anchor.conversationId === conversationId) {
      if (thread.loading) return;
      // Keep the same message in view when an older page is prepended.
      if (anchor.element.isConnected) area.scrollTop += anchor.element.getBoundingClientRect().top - anchor.top;
      historyAnchor.current = null;
    } else if (nearEnd.current) area.scrollTop = area.scrollHeight;
  }, [conversationId, thread?.loaded, thread?.loading, thread?.messages, state.drafts]);
  useEffect(() => {
    const area = scrollArea.current;
    if (!area) return;
    const observer = new ResizeObserver(() => { if (nearEnd.current) area.scrollTop = area.scrollHeight; });
    observer.observe(area);
    return () => observer.disconnect();
  }, [conversationId]);
  useEffect(() => {
    if (thread?.loaded && conversationId === focusComposerFor.current) {
      composer.current?.focus({ preventScroll: true }); focusComposerFor.current = undefined;
    }
  }, [thread?.loaded, conversationId]);

  useEffect(() => {
    const version = ++searchVersion.current;
    setSearch(null); setSearchError(undefined);
    if (!query.trim()) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      authRef.current.withCurrentAccess((token) => chatService.search(query.trim(), token))
        .then((page) => { if (version === searchVersion.current) setSearch(page); })
        .catch((error) => { if (version === searchVersion.current) setSearchError(chatFailure(error)); })
        .finally(() => { if (version === searchVersion.current) setSearching(false); });
    }, 250);
    return () => { clearTimeout(timer); searchVersion.current = version + 1; };
  }, [query, searchRetry]);

  async function moreSearch() {
    if (!search?.nextCursor) return;
    const version = searchVersion.current;
    setSearching(true); setSearchError(undefined);
    try {
      const page = await authRef.current.withCurrentAccess((token) => chatService.search(query.trim(), token, search.nextCursor!));
      if (version === searchVersion.current) setSearch({ items: [...search.items, ...page.items], nextCursor: page.nextCursor });
    } catch (error) { if (version === searchVersion.current) setSearchError(chatFailure(error)); }
    finally { if (version === searchVersion.current) setSearching(false); }
  }
  async function open(userId: string) {
    setOpening(userId); setSearchError(undefined);
    try {
      const result = await authRef.current.withCurrentAccess((token) => chatService.open(userId, token));
      focusComposerFor.current = result.conversationId;
      setQuery(""); navigate(`/messages/${result.conversationId}`);
    } catch (error) { setSearchError(chatFailure(error)); }
    finally { setOpening(undefined); }
  }
  async function block(userId: string, enabled: boolean) {
    setBlockBusy(true); setActionError(undefined);
    try { await controller.block(userId, enabled); }
    catch (error) { setActionError(chatFailure(error)); }
    finally { setBlockBusy(false); }
  }
  function send(event: FormEvent) {
    event.preventDefault();
    const error = messageValidation(text);
    if (error) { setValidation(error); return; }
    if (!conversationId || !selected?.messagingAvailable || state.connection !== "ready" || !thread?.loaded) return;
    setValidation(undefined); controller.send(conversationId, text);
    setDrafts((previous) => ({ ...previous, [conversationId]: "" })); nearEnd.current = true;
    composer.current?.focus({ preventScroll: true });
  }
  function edit(draft: DraftMessage) {
    if (text) { setValidation("Send or clear your current draft before editing another message."); return; }
    setDrafts((previous) => ({ ...previous, [draft.conversationId]: draft.text }));
    controller.discard(draft.clientMessageId); setValidation(undefined); composer.current?.focus({ preventScroll: true });
  }

  const unavailable = selected?.counterpart.accountStatus === "DELETED" ? "This account has been deleted. You can still read your conversation."
    : selected?.blocked ? (blockedByMe ? "You blocked this user. Unblock to allow messaging if they have not blocked you." : "Messaging is blocked for this conversation. You can still read your history.") : undefined;
  const statusText = { connecting: "Connecting…", ready: "Connected", reconnecting: "Reconnecting… Your messages are kept here.", offline: "You’re offline. Reconnect to send messages." }[state.connection];

  return <WorkspaceShell viewport className="chat-shell" userDescription="Your conversations with people on campus.">
    <header className="chat-page-heading"><div><h1>Messages</h1><p>Stay in touch with your campus community.</p></div><span className={`chat-connection ${state.connection}`} role="status"><span aria-hidden="true" />{statusText}</span></header>
    {state.connection !== "ready" ? <button className="chat-text-button chat-reconnect" onClick={() => controller.transport.reconnect()}>Reconnect now</button> : null}
    <div className={`chat-workspace${conversationId ? " has-thread" : ""}`}>
      <aside className="chat-directory" aria-label="Conversations and user search">
        <div className="chat-directory-heading"><h2>Your conversations</h2><button className="chat-text-button" aria-label="Refresh conversations" onClick={() => controller.synchronize()}>Refresh</button></div>
        <div className="chat-search"><label htmlFor="chat-search">Find someone by username</label><input autoComplete="off" id="chat-search" maxLength={64} onChange={(event) => setQuery(event.target.value)} placeholder="Search usernames" type="search" value={query} /></div>
        <div className="chat-directory-scroll" tabIndex={0} role="region" aria-label="Conversation list and blocked users">
        {query.trim() ? <section aria-label="Username search results" className="chat-search-results" aria-busy={searching}>
          {searching ? <p role="status">Searching…</p> : null}
          {searchError ? <p role="alert">{searchError} <button className="chat-text-button" onClick={() => setSearchRetry((value) => value + 1)}>Retry search</button></p> : null}
          {search?.items.length === 0 ? <p>No matching users. Try another username.</p> : null}
          <ul>{search?.items.map((person) => <li key={person.userId}><button disabled={!!opening} onClick={() => void open(person.userId)}><Avatar name={person.username} /><span>@{person.username}</span><small>{opening === person.userId ? "Opening…" : "Message"}</small></button></li>)}</ul>
          {search?.nextCursor ? <button className="chat-text-button" disabled={searching} onClick={() => void moreSearch()}>More matching users</button> : null}
        </section> : <>
          {state.listError ? <p className="chat-feedback" role="alert">{state.listError} <button className="chat-text-button" onClick={() => void controller.refresh()}>Retry conversations</button></p> : null}
          {state.listLoading && !state.conversations.length ? <p className="chat-feedback" role="status">Loading conversations…</p> : null}
          {!state.listLoading && !state.listError && !state.conversations.length ? <p className="chat-feedback">No conversations yet. Search for a username to start one.</p> : null}
          <ul className="chat-conversations">{state.conversations.map((item) => <ConversationRow item={item} selected={item.conversationId === conversationId} key={item.conversationId} />)}</ul>
          {state.nextCursor ? <button className="chat-text-button chat-more" disabled={state.listLoading} onClick={() => void controller.refresh(true)}>More conversations</button> : null}
        </>}
        <details className="chat-blocks"><summary>Blocked users{state.blocks.length ? ` (${state.blocks.length})` : ""}</summary>
          {state.blocksError ? <p role="alert">{state.blocksError} <button className="chat-text-button" onClick={() => void controller.refreshBlocks()}>Retry blocked users</button></p> : null}
          {state.blocksLoading ? <p role="status">Loading blocked users…</p> : !state.blocks.length ? <p>You haven’t blocked anyone.</p> : null}
          <ul>{state.blocks.map((person) => <li key={person.userId}><Person person={person} /><button className="chat-text-button" disabled={blockBusy} onClick={() => void block(person.userId, false)}>Unblock<span className="chat-sr-only"> {person.displayName}</span></button></li>)}</ul>
        </details>
        </div>
      </aside>
      <section className="chat-thread" aria-label="Conversation">
        {!conversationId ? <div className="chat-welcome"><MessagesIcon /><h2>A conversation starts here</h2><p>Find someone by username or open an existing conversation.</p><button className="chat-button" onClick={() => document.getElementById("chat-search")?.focus()}>Find someone</button></div> : <>
          <header className="chat-thread-heading"><Link className="chat-back" to="/messages" aria-label="Back to conversations">←</Link>{selected ? <><Avatar name={selected.counterpart.displayName} /><Person person={selected.counterpart} /><button className="chat-text-button chat-block-control" disabled={blockBusy || state.blocksLoading || !!state.blocksError} onClick={() => void block(selected.counterpart.userId, !blockedByMe)}>{blockBusy ? "Saving…" : blockedByMe ? "Unblock user" : "Block user"}</button></> : <h2>Conversation</h2>}</header>
          {actionError ? <p className="chat-feedback" role="alert">{actionError}</p> : null}
          {unavailable ? <p className="chat-notice" role="status">{unavailable}</p> : null}
          {thread?.error ? <p className="chat-feedback" role="alert">{thread.error} <button className="chat-text-button" onClick={() => thread.loaded ? controller.synchronize() : void controller.loadThread(conversationId)}>Retry conversation</button></p> : null}
          {thread?.readError ? <p className="chat-feedback" role="alert">{thread.readError} <button className="chat-text-button" onClick={() => controller.retryRead(conversationId)}>Retry read update</button></p> : null}
          <div className="chat-history" ref={scrollArea} onScroll={() => { const element = scrollArea.current; if (element) nearEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }} tabIndex={0} aria-label="Message history">
            {thread?.hasMore ? <button className="chat-text-button chat-older" disabled={thread.loading} onClick={() => {
              const element = scrollArea.current?.querySelector<HTMLElement>(".chat-message");
              nearEnd.current = false;
              if (element) historyAnchor.current = { conversationId, element, top: element.getBoundingClientRect().top };
              void controller.older(conversationId);
            }}>Load older messages</button> : null}
            {thread?.loading ? <p className="chat-feedback" role="status">Loading messages…</p> : null}
            {thread?.recovering ? <p className="chat-feedback" role="status">Updating message history…</p> : null}
            {thread?.loaded && !thread.messages.length ? <p className="chat-empty">No messages yet. Say hello.</p> : null}
            <ol className="chat-messages" aria-label="Messages" aria-live="polite" aria-relevant="additions text">
              {thread?.messages.map((message) => <li className={`chat-message ${message.senderUserId === auth.user!.userId ? "own" : "received"}`} key={message.messageId}>
                <span className="chat-sr-only">{message.senderUserId === auth.user!.userId ? "You" : selected?.counterpart.displayName ?? "Received message"}</span><p>{message.text}</p><span className="chat-message-meta"><Time value={message.createdAt} /><span>{message.senderUserId === auth.user!.userId ? "Sent" : "Received"}</span></span>
              </li>)}
              {state.drafts.filter((draft) => draft.conversationId === conversationId).map((draft) => <li className={`chat-message own ${draft.status}`} key={draft.clientMessageId}>
                <p>{trimMessage(draft.text)}</p><span className="chat-message-meta"><Time value={draft.createdAt} /><span>{draft.status === "pending" ? "Sending…" : "Not confirmed"}</span></span>
                {draft.status === "failed" ? <div className="chat-send-error"><p role="alert">{draft.error}</p><button className="chat-text-button" disabled={state.connection !== "ready"} onClick={() => controller.retry(draft)}>Retry message</button><button className="chat-text-button" onClick={() => edit(draft)}>Edit as new message</button></div> : null}
              </li>)}
            </ol>
          </div>
          <form className="chat-composer" onSubmit={send}>
            <label className="chat-sr-only" htmlFor="chat-message">Message</label>
            <textarea ref={composer} id="chat-message" aria-describedby="chat-composer-help chat-validation" aria-invalid={!!validation} disabled={!thread?.loaded || !selected?.messagingAvailable} placeholder={unavailable ? "Messaging unavailable" : "Write a message…"} rows={2} value={text} onChange={(event) => { setDrafts((previous) => ({ ...previous, [conversationId]: event.target.value })); setValidation(undefined); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) send(event); }} />
            <div className="chat-composer-footer"><span id="chat-composer-help">Enter to send · Shift+Enter for a new line</span><span className={[...text].length > 4096 ? "chat-limit-error" : ""}>{[...text].length.toLocaleString()} / 4,096</span><button className="chat-button" disabled={!thread?.loaded || !selected?.messagingAvailable || state.connection !== "ready" || !trimMessage(text)} type="submit">Send</button></div>
            <p id="chat-validation" className="chat-validation" role={validation ? "alert" : undefined}>{validation}</p>
          </form>
        </>}
      </section>
    </div>
    {!conversationId && actionError ? <p className="chat-feedback" role="alert">{actionError}</p> : null}
  </WorkspaceShell>;
}
