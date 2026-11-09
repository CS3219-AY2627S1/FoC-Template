// AI-assisted: responsive app shell with nav items, credits widget, desktop navbar and mobile bottom tab bar.
import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Box,
  Burger,
  Drawer,
  Group,
  Indicator,
  Menu,
  NavLink as MantineNavLink,
  ScrollArea,
  Stack,
  Text,
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
  adminOnly?: boolean;
  /** Only in the mobile menu; desktop reaches it from a header icon instead. */
  mobileOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/suppliers", label: "Suppliers", icon: <IconBuildingStore size={18} /> },
  { to: "/profile", label: "Profile", icon: <IconUser size={18} /> },
  { to: "/errands", label: "Errands", icon: <IconShoppingBag size={18} /> },
  { to: "/orders/mine", label: "My requests", icon: <IconClipboardList size={18} /> },
  { to: "/deliveries", label: "My deliveries", icon: <IconTruck size={18} /> },
  { to: "/notifications", label: "Notifications", icon: <IconBell size={18} /> },
  { to: "/messages", label: "Messages", icon: <IconMessages size={18} />, mobileOnly: true },
  {
    to: "/admin/suppliers",
    label: "Manage Suppliers",
    icon: <IconShieldCog size={18} />,
    adminOnly: true,
  },
  {
    to: "/admin/clients",
    label: "Client Accounts",
    icon: <IconUsers size={18} />,
    adminOnly: true,
  },
];

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
          <ActionIcon
            variant="subtle"
            size="sm"
            disabled={unreadCount === 0}
            onClick={(e) => {
              e.stopPropagation();
              void markAllRead();
            }}
            aria-label="Mark all as read"
          >
            <Text size="xs">Mark all</Text>
          </ActionIcon>
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

export function AppLayout() {
  const { user, role, isAdmin, logout } = useAuth();
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

          {/* Desktop nav */}
          <Group gap="lg" visibleFrom="sm" wrap="nowrap">
            {items
              .filter((item) => !item.mobileOnly)
              .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  textDecoration: "none",
                  fontWeight: 600,
                  color: isActive ? "var(--mantine-color-brand-7)" : "#495057",
                  borderBottom: isActive
                    ? "2px solid var(--mantine-color-brand-6)"
                    : "2px solid transparent",
                  paddingBottom: 4,
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </Group>

          <Group gap="sm" wrap="nowrap">
            {role && (
              <Badge
                color={isAdmin ? "brand" : "gray"}
                variant="light"
                visibleFrom="xs"
              >
                {isAdmin ? "Admin" : "Client"}
              </Badge>
            )}
            {balance && (
              <Badge color="teal" variant="light" visibleFrom="xs">
                {balance.available_balance} avail / {balance.reserved_balance} rsv
              </Badge>
            )}
            <ChatButton unread={unread} />
            <NotificationBell />
            <Avatar radius="xl" color="brand" size="sm" visibleFrom="sm">
              {initials(user?.display_name, user?.email)}
            </Avatar>
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={handleLogout}
              visibleFrom="sm"
              aria-label="Log out"
            >
              <IconLogout size={20} />
            </ActionIcon>
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
          {role && (
            <Badge color={isAdmin ? "brand" : "gray"} variant="light">
              {isAdmin ? "Admin" : "Client"}
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
          <MantineNavLink
            label="Log out"
            leftSection={<IconLogout size={18} />}
            onClick={() => {
              drawer.close();
              handleLogout();
            }}
          />
        </Stack>
      </Drawer>
    </AppShell>
  );
}
