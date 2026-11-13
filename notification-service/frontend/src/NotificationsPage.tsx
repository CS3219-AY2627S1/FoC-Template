import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  BellOff,
  BellRing,
  CircleAlert,
  CircleCheck,
  Coins,
  LogIn,
  MessageCircle,
  PackageCheck,
} from "lucide-react";
import {
  NotificationApiError,
  listNotifications,
  markRead,
  type NotificationItem,
  type NotificationPage,
} from "./api/notificationApi";
import { readSession } from "./auth/session";
import { StatePanel } from "./components/StatePanel";
import { unreadChangedEvent } from "./components/useUnreadCount";
import { navigateTo, signInPath } from "./navigation";

const listKey = ["notifications"];

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** The signed-in user's notifications, newest first, 20 at a time. */
export function NotificationsPage() {
  const signedIn = readSession() !== null;
  const queryClient = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) => listNotifications(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.page + 1 < last.totalPages ? last.page + 1 : undefined,
    enabled: signedIn,
    retry: (failures, error) =>
      !(error instanceof NotificationApiError && error.status === 401) &&
      failures < 1,
  });
  const read = useMutation({
    mutationFn: markRead,
    onSuccess: (updated) => {
      queryClient.setQueryData<InfiniteData<NotificationPage>>(
        listKey,
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              content: page.content.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            })),
          },
      );
      window.dispatchEvent(new Event(unreadChangedEvent));
    },
  });

  const sessionEnded =
    !signedIn ||
    (list.error instanceof NotificationApiError && list.error.status === 401);

  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">Activity centre</p>
        <h1>Notifications</h1>
        <p>
          Stay on top of errand milestones and credit activity, newest first.
        </p>
      </div>
      {sessionEnded ? (
        <StatePanel
          action={
            <a className="sign-in-link" href={signInPath("/notifications")}>
              <LogIn aria-hidden="true" />
              Sign in again
            </a>
          }
          icon={LogIn}
          title="You’ve been signed out"
        >
          Sign in to see your notifications.
        </StatePanel>
      ) : list.isPending ? (
        <NotificationListSkeleton />
      ) : list.isError ? (
        <StatePanel
          action={
            <button onClick={() => void list.refetch()} type="button">
              Try again
            </button>
          }
          icon={CircleAlert}
          title="We couldn’t load your notifications"
        >
          Please try again.
        </StatePanel>
      ) : list.data.pages[0]?.totalElements === 0 ? (
        <StatePanel
          action={
            <a className="sign-in-link" href="/errands/browse">
              Browse errands
            </a>
          }
          icon={BellOff}
          title="No notifications yet."
        >
          Updates about your errands and credits will appear here.
        </StatePanel>
      ) : (
        <>
          <div
            className="notification-legend"
            aria-label="Notification categories"
          >
            <span className="legend-errand">
              <i aria-hidden="true" />
              Errand updates
            </span>
            <span className="legend-credit">
              <i aria-hidden="true" />
              Credit activity
            </span>
            <span className="legend-attention">
              <i aria-hidden="true" />
              Needs attention
            </span>
          </div>
          <ul aria-label="Your notifications" className="notification-list">
            {list.data.pages
              .flatMap((page) => page.content)
              .map((item) => (
                <NotificationRow
                  busy={read.isPending && read.variables === item.id}
                  item={item}
                  key={item.id}
                  onMarkRead={() => read.mutate(item.id)}
                  onOpen={async () => {
                    if (!item.readAt) {
                      try {
                        await read.mutateAsync(item.id);
                      } catch {
                        // Opening the errand matters more than the read mark; the badge catches up.
                      }
                    }
                    navigateTo(`/errands/${item.orderId}`);
                  }}
                />
              ))}
          </ul>
          {read.isError && (
            <p className="notification-feedback" role="alert">
              Couldn't mark that notification as read. Please try again.
            </p>
          )}
          {list.hasNextPage && (
            <div className="notification-more">
              <button
                className="button-secondary"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
                type="button"
              >
                {list.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function NotificationRow({
  item,
  busy,
  onMarkRead,
  onOpen,
}: {
  item: NotificationItem;
  busy: boolean;
  onMarkRead: () => void;
  onOpen: () => void;
}) {
  const unread = item.readAt === null;
  const presentation = notificationPresentation(item.type);
  const Icon = presentation.icon;
  return (
    <li
      className={`card notification-item notification-${presentation.tone}${unread ? " notification-unread" : ""}`}
    >
      <span className="notification-icon" aria-hidden="true">
        <Icon />
      </span>
      <div className="notification-text">
        <div className="notification-meta">
          <span className="notification-kind">{presentation.label}</span>
          {unread && <span className="notification-status">Unread</span>}
        </div>
        <p className="notification-message">{item.message}</p>
        <time dateTime={item.occurredAt}>
          {dateFormat.format(new Date(item.occurredAt))}
        </time>
      </div>
      <div className="notification-actions">
        {item.orderId && (
          <button disabled={busy} onClick={onOpen} type="button">
            Open errand
          </button>
        )}
        {unread && (
          <button
            className="button-secondary"
            disabled={busy}
            onClick={onMarkRead}
            type="button"
          >
            {busy ? "Marking…" : "Mark as read"}
          </button>
        )}
      </div>
    </li>
  );
}

function notificationPresentation(type: string) {
  if (type === "CHAT_MESSAGE_RECEIVED") {
    return { icon: MessageCircle, label: "Chat message", tone: "errand" };
  }
  if (type.includes("CREDIT") || type.includes("REWARD")) {
    return { icon: Coins, label: "Credit activity", tone: "credit" };
  }
  if (
    type.includes("FAILED") ||
    type.includes("REJECTED") ||
    type.includes("EXPIRED") ||
    type.includes("CANCELLED")
  ) {
    return { icon: CircleAlert, label: "Needs attention", tone: "attention" };
  }
  if (type.includes("COMPLETED") || type.includes("DELIVERED")) {
    return { icon: CircleCheck, label: "Errand complete", tone: "complete" };
  }
  if (
    type.includes("ACCEPTED") ||
    type.includes("PICKED_UP") ||
    type.includes("COURIER")
  ) {
    return { icon: PackageCheck, label: "Errand progress", tone: "errand" };
  }
  return { icon: BellRing, label: "Errand update", tone: "errand" };
}

/** Placeholders shaped like the list; the label is read out instead of the shapes. */
function NotificationListSkeleton() {
  return (
    <div className="notification-list" role="status">
      <span className="visually-hidden">Loading your notifications</span>
      {[0, 1, 2].map((index) => (
        <div aria-hidden="true" className="card notification-item" key={index}>
          <span className="notification-icon notification-icon-skeleton" />
          <div className="notification-text">
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-line skeleton-short" />
          </div>
        </div>
      ))}
    </div>
  );
}
