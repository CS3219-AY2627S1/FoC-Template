// AI-assisted: responsive app shell with nav items, credits widget, desktop navbar and mobile bottom tab bar.
// UI tweaks (Claude Opus 5.5): grouped nav, avatar account menu, credits tooltip. Reviewed by authors.
import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Button,
  Divider,
  Drawer,
  Group,
  Indicator,
  Menu,
  NavLink as MantineNavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBell,
  IconBuildingStore,
  IconClipboardList,
  IconLogout,
  IconMessages,
  IconShieldCog,
  IconShoppingBag,
  IconTruck,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BalanceResponse, creditsApi, parseUtcDate } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/useNotifications";
import { useChat } from "../lib/chat/context";
import { totalUnread } from "../lib/chat/store";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** Desktop nav items are grouped by this, with a divider between groups. */
  group: "request" | "deliver" | "admin" | "account";
  adminOnly?: boolean;
  /** Only in the mobile menu; desktop reaches it from a header icon instead. */
  mobileOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  // As a requester: pick a vendor and post an errand, then track it.
  { to: "/suppliers", label: "Request Errand", icon: <IconBuildingStore size={18} />, group: "request" },
  { to: "/orders/mine", label: "My Requests", icon: <IconClipboardList size={18} />, group: "request" },
  // As a courier: take someone's errand, then deliver it.
  { to: "/errands", label: "Take Errands", icon: <IconShoppingBag size={18} />, group: "deliver" },
  { to: "/deliveries", label: "My Deliveries", icon: <IconTruck size={18} />, group: "deliver" },
  {
    to: "/admin/suppliers",
    label: "Manage Suppliers",
    icon: <IconShieldCog size={18} />,
    group: "admin",
    adminOnly: true,
  },
  {
    to: "/admin/clients",
    label: "Client Accounts",
    icon: <IconUsers size={18} />,
    group: "admin",
    adminOnly: true,
  },
  // Desktop reaches these from the header icons (bell, chat, avatar).
  { to: "/messages", label: "Messages", icon: <IconMessages size={18} />, group: "account", mobileOnly: true },
  { to: "/notifications", label: "Notifications", icon: <IconBell size={18} />, group: "account", mobileOnly: true },
  { to: "/profile", label: "Profile", icon: <IconUser size={18} />, group: "account", mobileOnly: true },
];

const DESKTOP_GROUPS: NavItem["group"][] = ["request", "deliver", "admin"];

function initials(name: string | undefined, email: string | undefined): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }
  return (email?.[0] ?? "?").toUpperCase();
}

function NotificationBell() {
  const navigate = useNavigate();
  const { items, unreadCount, markOneRead, markAllRead } = useNotifications(10);

  const handleClick = (orderId: string, notificationId: string, unread: boolean) => {
    if (unread) void markOneRead(notificationId);
    navigate(`/orders/${orderId}`);
  };

  return (
    <Menu position="bottom-end" width={320} shadow="md">
      <Menu.Target>
        <Indicator
          color="red"
          size={16}
          label={unreadCount > 99 ? "99+" : unreadCount}
          disabled={unreadCount === 0}
          offset={4}
        >
          <ActionIcon variant="subtle" color="gray" aria-label="Notifications">
            <IconBell size={20} />
          </ActionIcon>
        </Indicator>
      </Menu.Target>
      <Menu.Dropdown>
        <Group justify="space-between" px="sm" py={4} wrap="nowrap">
          <Text fw={600} size="sm">
            Notifications
          </Text>
          <Button
            variant="subtle"
            size="compact-xs"
            disabled={unreadCount === 0}
            onClick={(e) => {
              e.stopPropagation();
              void markAllRead();
            }}
            aria-label="Mark all as read"
          >
            Mark all as read
          </Button>
        </Group>
        <Menu.Divider />
        {items.length === 0 ? (
          <Menu.Item disabled>No notifications</Menu.Item>
        ) : (
          <ScrollArea.Autosize mah={360}>
            {items.map((n) => {
              const unread = n.read_at === null;
              return (
                <Menu.Item
                  key={n.notification_id}
                  onClick={() =>
                    handleClick(n.order_id, n.notification_id, unread)
                  }
                  style={
                    unread
                      ? { backgroundColor: "var(--mantine-color-blue-light)" }
                      : undefined
                  }
                >
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="sm" fw={unread ? 700 : 500} lineClamp={1}>
                      {n.title}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                      {parseUtcDate(n.created_at).toLocaleDateString()}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {n.body}
                  </Text>
                </Menu.Item>
              );
            })}
          </ScrollArea.Autosize>
        )}
        <Menu.Divider />
        <Menu.Item onClick={() => navigate("/notifications")}>
          <Text size="sm" ta="center">
            View all
          </Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function ChatButton({ unread }: { unread: number }) {
  return (
    <Indicator
      label={unread > 99 ? "99+" : unread}
      size={16}
      color="red"
      disabled={unread === 0}
      offset={4}
      data-testid="nav-unread"
    >
      <ActionIcon
        component={NavLink}
        to="/messages"
        variant="subtle"
        color="gray"
        aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
      >
        <IconMessages size={20} />
      </ActionIcon>
    </Indicator>
  );
}

function CreditsBadge({ balance }: { balance: BalanceResponse }) {
  const navigate = useNavigate();
  const reserved = balance.reserved_balance;
  return (
    <Tooltip
      multiline
      w={260}
      withArrow
      label={
        <>
          <b>Available</b>: credits you can spend on new requests.
          <br />
          <b>Reserved</b>: held for your open requests until they complete or are
          cancelled.
        </>
      }
    >
      <Badge
        component="button"
        type="button"
        color="teal"
        variant="light"
        tt="none"
        visibleFrom="xs"
        style={{ cursor: "pointer", border: 0 }}
        onClick={() => navigate("/profile#credits")}
        data-testid="credits-badge"
      >
        {balance.available_balance} avail
        {reserved > 0 ? ` | ${reserved} rsv` : ""}
      </Badge>
    </Tooltip>
  );
}

function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <Menu position="bottom-end" width={220} shadow="md">
      <Menu.Target>
        <UnstyledButton aria-label="Account menu" visibleFrom="sm" style={{ display: "flex" }}>
          <Avatar radius="xl" color="brand" size="sm">
            {initials(user?.display_name, user?.email)}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Box px="sm" py={6}>
          <Text size="sm" fw={600} truncate>
            {user?.display_name}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {user?.email}
          </Text>
        </Box>
        <Menu.Divider />
        <Menu.Item leftSection={<IconUser size={16} />} onClick={() => navigate("/profile")}>
          Profile
        </Menu.Item>
        <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={onLogout}>
          Log out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function navLinkStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return {
    textDecoration: "none",
    fontWeight: 600,
    whiteSpace: "nowrap",
    color: isActive ? "var(--mantine-color-brand-7)" : "#495057",
    borderBottom: isActive
      ? "2px solid var(--mantine-color-brand-6)"
      : "2px solid transparent",
    paddingBottom: 4,
  };
}

export function AppLayout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpened, drawer] = useDisclosure(false);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const unread = useChat((s) => totalUnread(s.convs), 0);

  useEffect(() => {
    if (!user?.id) return;
    const fetch = () => creditsApi.getBalance(user.id).then(setBalance).catch(() => {});
    fetch();
    window.addEventListener("credits-changed", fetch);
    return () => window.removeEventListener("credits-changed", fetch);
  }, [user?.id]);

  const items = NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconBuildingStore size={22} />
            <Text fw={700} size="lg">
              Campus Errands
            </Text>
          </Group>

          {/* Desktop nav: requester links | courier links | admin links */}
          <Group gap="xl" visibleFrom="sm" wrap="nowrap" data-testid="desktop-nav">
            {DESKTOP_GROUPS.map((group) => ({
              group,
              links: items.filter((i) => i.group === group && !i.mobileOnly),
            }))
              .filter(({ links }) => links.length > 0)
              .map(({ group, links }, gi) => (
                <React.Fragment key={group}>
                  {gi > 0 && <Divider orientation="vertical" my={4} />}
                  <Group gap="lg" wrap="nowrap">
                    {links.map((item) => (
                      <NavLink key={item.to} to={item.to} style={navLinkStyle}>
                        {item.label}
                      </NavLink>
                    ))}
                  </Group>
                </React.Fragment>
              ))}
          </Group>

          <Group gap="sm" wrap="nowrap">
            {isAdmin && (
              <Badge color="brand" variant="light" visibleFrom="xs">
                Admin
              </Badge>
            )}
            {balance && <CreditsBadge balance={balance} />}
            <ChatButton unread={unread} />
            <NotificationBell />
            <AccountMenu onLogout={handleLogout} />
            {/* Mobile burger */}
            <Burger
              opened={drawerOpened}
              onClick={drawer.toggle}
              hiddenFrom="sm"
              size="sm"
            />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Box maw={1080} mx="auto">
          <React.Suspense fallback={null}>
            <Outlet />
          </React.Suspense>
        </Box>
      </AppShell.Main>

      {/* Mobile navigation drawer */}
      <Drawer
        opened={drawerOpened}
        onClose={drawer.close}
        title="Menu"
        hiddenFrom="sm"
        size="70%"
      >
        <Stack gap="xs">
          {isAdmin && (
            <Badge color="brand" variant="light">
              Admin
            </Badge>
          )}
          {items.map((item) => (
            <MantineNavLink
              key={item.to}
              component={NavLink}
              to={item.to}
              label={item.label}
              leftSection={item.icon}
              rightSection={
                item.to === "/messages" && unread > 0 ? (
                  <Badge size="xs" circle>
                    {unread > 99 ? "99+" : unread}
                  </Badge>
                ) : undefined
              }
              onClick={drawer.close}
            />
          ))}
        </Stack>
      </Drawer>
    </AppShell>
  );
}
