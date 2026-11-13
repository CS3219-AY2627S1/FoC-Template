import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

SELECTORS = {
    "user": (
        ROOT / "user-service/frontend/src/styles.css",
        ".workspace-selector-options",
        ".workspace-selector-options button",
    ),
    "supplier": (
        ROOT / "supplier-service/frontend/src/components/AppShell.module.css",
        ".workspaceSelectorOptions",
        ".actions .workspaceSelectorOptions button",
    ),
    "order": (
        ROOT / "order-service/frontend/src/styles.css",
        ".workspace-selector-options",
        ".workspace-selector-options button",
    ),
    "credit": (
        ROOT / "credit-service/frontend/src/styles.css",
        ".workspace-selector-options",
        ".workspace-selector-options button",
    ),
    "admin": (
        ROOT / "admin-service/frontend/src/styles.css",
        ".workspace-selector-options",
        ".workspace-selector-options button",
    ),
    "notification": (
        ROOT / "notification-service/frontend/src/styles.css",
        ".workspace-selector-options",
        ".workspace-selector-options button",
    ),
}

# The header bell (design.md "Shared application shell") is copied into every frontend. The copies
# must stay identical; Notification Service owns them.
BELL_SOURCES = ("NotificationBell.tsx", "useUnreadCount.ts", "NotificationBell.test.tsx")
BELL_FRONTENDS = ("user", "supplier", "order", "credit", "admin", "notification")
PUSH_SOURCES = ("NotificationPush.tsx", "NotificationPush.css")
BELL_STYLES = {
    "user": (ROOT / "user-service/frontend/src/styles.css", ".notification-bell"),
    "supplier": (ROOT / "supplier-service/frontend/src/components/AppShell.module.css", ".notificationBell"),
    "order": (ROOT / "order-service/frontend/src/styles.css", ".notification-bell"),
    "credit": (ROOT / "credit-service/frontend/src/styles.css", ".notification-bell"),
    "admin": (ROOT / "admin-service/frontend/src/styles.css", ".notification-bell"),
    "notification": (ROOT / "notification-service/frontend/src/styles.css", ".notification-bell"),
}

HEADER_LAYER_STYLES = {
    "user": (
        ROOT / "user-service/frontend/src/styles.css",
        ".profile-app-header",
        ".profile-account-menu-items",
        ".notification-badge",
    ),
    "supplier": (
        ROOT / "supplier-service/frontend/src/components/AppShell.module.css",
        ".header",
        ".userMenuItems",
        ".notificationBadge",
    ),
    "order": (
        ROOT / "order-service/frontend/src/styles.css",
        ".site-header",
        ".account-menu-items",
        ".notification-badge",
    ),
    "credit": (
        ROOT / "credit-service/frontend/src/styles.css",
        ".site-header",
        ".account-menu-items",
        ".notification-badge",
    ),
    "admin": (
        ROOT / "admin-service/frontend/src/styles.css",
        ".site-header",
        ".account-menu-items",
        ".notification-badge",
    ),
    "notification": (
        ROOT / "notification-service/frontend/src/styles.css",
        ".site-header",
        ".account-menu-items",
        ".notification-badge",
    ),
}

PRIMARY_NAV_SOURCES = {
    "user": ROOT / "user-service/frontend/src/App.tsx",
    "supplier": ROOT / "supplier-service/frontend/src/components/AppShell.tsx",
    "order": ROOT / "order-service/frontend/src/components/OrderShell.tsx",
    "credit": ROOT / "credit-service/frontend/src/components/CreditShell.tsx",
    "admin": ROOT / "admin-service/frontend/src/components/AdminShell.tsx",
    "notification": ROOT / "notification-service/frontend/src/components/NotificationShell.tsx",
}


def declarations(css, selector):
    match = re.search(re.escape(selector) + r"\s*\{([^}]*)\}", css, re.DOTALL)
    if match is None:
        raise AssertionError(f"Missing CSS rule: {selector}")
    result = {}
    for declaration in match.group(1).split(";"):
        if ":" not in declaration:
            continue
        name, value = declaration.split(":", 1)
        result[name.strip()] = " ".join(value.split())
    return result


def cascaded_declarations(css, selector):
    """Merge every exact selector block in source order, like the CSS cascade."""
    matches = re.findall(re.escape(selector) + r"\s*\{([^}]*)\}", css, re.DOTALL)
    if not matches:
        raise AssertionError(f"Missing CSS rule: {selector}")
    result = {}
    for block in matches:
        for declaration in block.split(";"):
            if ":" not in declaration:
                continue
            name, value = declaration.split(":", 1)
            result[name.strip()] = " ".join(value.split())
    return result


HEADER_ACTIONS = re.compile(r"(?:^|\s|,)\.(?:header-actions|profile-app-actions|actions)\s*>?\s*a(?![\w-])")


def header_action_selectors(css):
    """Selectors that style a link (or its icon) in the header's account/actions area."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)
    found = []
    for match in re.finditer(r"([^{}]+)\{[^{}]*\}", css):
        for selector in match.group(1).split(","):
            selector = " ".join(selector.split())
            if HEADER_ACTIONS.search(selector) and not selector.endswith((":hover", ":focus-visible")):
                found.append(selector)
    return found


class SharedRoleSelectorDesignTest(unittest.TestCase):
    def test_every_frontend_uses_the_same_role_selector_box_model(self):
        for service, (path, options_selector, button_selector) in SELECTORS.items():
            with self.subTest(service=service):
                css = path.read_text()
                options = declarations(css, options_selector)
                button = declarations(css, button_selector)

                self.assertEqual("inline-flex", options.get("display"))
                self.assertEqual("center", options.get("align-items"))
                self.assertEqual("0.1875rem", options.get("padding"))

                expected_button = {
                    "display": "inline-flex",
                    "align-items": "center",
                    "justify-content": "center",
                    "appearance": "none",
                    "height": "2rem",
                    "min-height": "2rem",
                    "margin": "0",
                    "font-size": "0.78rem",
                    "font-weight": "600",
                    "line-height": "1",
                }
                for property_name, expected in expected_button.items():
                    self.assertEqual(
                        expected,
                        button.get(property_name),
                        f"{service} differs for {property_name}",
                    )


# design.md "Type, spacing and shape": DM Sans with the packaged Public Sans and system fallbacks.
# Each frontend sets it once on its root rule; without it the browser falls back to serif.
ROOT_FONTS = {
    "user": (ROOT / "user-service/frontend/src/styles.css", ":root"),
    "supplier": (ROOT / "supplier-service/frontend/src/styles/global.css", "html"),
    "order": (ROOT / "order-service/frontend/src/styles.css", ":root"),
    "credit": (ROOT / "credit-service/frontend/src/styles.css", ":root"),
    "admin": (ROOT / "admin-service/frontend/src/styles.css", ":root"),
    "notification": (ROOT / "notification-service/frontend/src/styles.css", ":root"),
}


class SharedTypefaceTest(unittest.TestCase):
    def test_every_frontend_sets_shared_interface_type_on_its_root(self):
        for service, (path, selector) in ROOT_FONTS.items():
            with self.subTest(service=service):
                root = declarations(path.read_text(), selector)
                self.assertEqual(
                    "'DM Sans', 'Public Sans', system-ui, sans-serif",
                    root.get("font-family", "").replace('"', "'"),
                )


# design.md "Colour" and "Responsive and accessible delivery": every keyboard focus ring uses
# the shared blue, and interactive hover states must not fall back to the retired green palette.
FOCUS_STYLES = {
    "user": (
        ROOT / "user-service/frontend/src/styles.css",
        ROOT / "user-service/frontend/src/styles.css",
        "--foc-focus",
    ),
    "supplier": (
        ROOT / "supplier-service/frontend/src/styles/tokens.css",
        ROOT / "supplier-service/frontend/src/styles/global.css",
        "--foc-focus",
    ),
    "order": (
        ROOT / "order-service/frontend/src/styles.css",
        ROOT / "order-service/frontend/src/styles.css",
        "--focus",
    ),
    "credit": (
        ROOT / "credit-service/frontend/src/styles.css",
        ROOT / "credit-service/frontend/src/styles.css",
        "--focus",
    ),
    "admin": (
        ROOT / "admin-service/frontend/src/styles.css",
        ROOT / "admin-service/frontend/src/styles.css",
        "--focus",
    ),
    "notification": (
        ROOT / "notification-service/frontend/src/styles.css",
        ROOT / "notification-service/frontend/src/styles.css",
        "--focus",
    ),
}


class SharedInteractionDesignTest(unittest.TestCase):
    def test_every_frontend_uses_the_shared_keyboard_focus_colour(self):
        for service, (tokens_path, focus_path, variable) in FOCUS_STYLES.items():
            with self.subTest(service=service):
                tokens = declarations(tokens_path.read_text(), ":root")
                self.assertEqual("#5068b3", tokens.get(variable))
                focus = declarations(focus_path.read_text(), ":focus-visible")
                self.assertEqual(f"3px solid var({variable})", focus.get("outline"))

    def test_retired_green_hover_colour_is_not_used(self):
        paths = {path for path, _, _ in FOCUS_STYLES.values()}
        paths.update(path for _, path, _ in FOCUS_STYLES.values())
        paths.add(
            ROOT
            / "supplier-service/frontend/src/components/ConfirmationDialog.module.css"
        )
        for path in paths:
            with self.subTest(path=path.relative_to(ROOT)):
                self.assertNotIn("#194f3d", path.read_text().lower())


class SharedNotificationBellTest(unittest.TestCase):
    def test_every_frontend_has_the_same_bell(self):
        for source in BELL_SOURCES:
            reference = (ROOT / "notification-service/frontend/src/components" / source).read_text()
            for service in BELL_FRONTENDS:
                with self.subTest(service=service, source=source):
                    copy = ROOT / f"{service}-service/frontend/src/components" / source
                    self.assertEqual(reference, copy.read_text(), f"{service} {source} differs")

    def test_every_frontend_has_the_same_participant_push_component(self):
        for source in PUSH_SOURCES:
            reference = (ROOT / "notification-service/frontend/src/components" / source).read_text()
            for service in BELL_FRONTENDS:
                with self.subTest(service=service, source=source):
                    copy = ROOT / f"{service}-service/frontend/src/components" / source
                    self.assertEqual(reference, copy.read_text(), f"{service} {source} differs")

    def test_every_shell_passes_its_current_role_to_push_notifications(self):
        for service, path in PRIMARY_NAV_SOURCES.items():
            with self.subTest(service=service):
                self.assertRegex(path.read_text(), r'<NotificationPush role=\{session\??\.role\} />')

    def test_every_frontend_gives_the_bell_the_same_control_size(self):
        for service, (path, selector) in BELL_STYLES.items():
            with self.subTest(service=service):
                bell = declarations(path.read_text(), selector)
                self.assertEqual("2.75rem", bell.get("width"))
                self.assertEqual("2.75rem", bell.get("height"))

    def test_every_frontend_gives_the_bell_icon_the_same_size(self):
        for service, (path, selector) in BELL_STYLES.items():
            with self.subTest(service=service):
                css = path.read_text()
                icon = declarations(css, selector + " svg")
                self.assertEqual("1.25rem", icon.get("width"))
                self.assertEqual("1.25rem", icon.get("height"))
                self.assertEqual("inline-grid", declarations(css, selector).get("display"))
                # Header-action rules for nav-sized icons must exclude the bell, or its icon and
                # layout differ between frontends (the Errands bell rendered at 1rem, Home at 1.25rem).
                for rule_selector in header_action_selectors(css):
                    self.assertIn(
                        f":not({selector})",
                        rule_selector,
                        f"{service} rule '{rule_selector}' also styles the bell",
                    )

    def test_every_frontend_hides_the_bell_in_admin_mode(self):
        participant_only = re.compile(
            r"(?:!adminMode|session\??\.role\s*!==\s*'ADMIN')\s*&&\s*\(?\s*<NotificationBell"
        )
        for service, path in PRIMARY_NAV_SOURCES.items():
            with self.subTest(service=service):
                self.assertRegex(path.read_text(), participant_only)

    def test_every_frontend_keeps_account_menus_above_page_content(self):
        for service, (path, header_selector, menu_selector, _) in HEADER_LAYER_STYLES.items():
            with self.subTest(service=service):
                css = path.read_text()
                header = cascaded_declarations(css, header_selector)
                menu = cascaded_declarations(css, menu_selector)

                self.assertEqual("relative", header.get("position"))
                self.assertEqual("100", header.get("z-index"))
                self.assertEqual("visible", header.get("overflow"))
                self.assertEqual("120", menu.get("z-index"))
                self.assertEqual("auto", menu.get("pointer-events"))

    def test_every_frontend_uses_the_same_unread_badge_colours(self):
        for service, (path, _, _, badge_selector) in HEADER_LAYER_STYLES.items():
            with self.subTest(service=service):
                badge = cascaded_declarations(path.read_text(), badge_selector)
                self.assertEqual("#df9b93", badge.get("background"))
                self.assertEqual("#172641", badge.get("color"))


class SharedPrimaryNavigationTest(unittest.TestCase):
    def test_every_frontend_uses_text_only_primary_navigation(self):
        for service, path in PRIMARY_NAV_SOURCES.items():
            with self.subTest(service=service):
                source = path.read_text()
                navigation = re.search(
                    r'<nav[^>]+aria-label="Main navigation"[\s\S]*?</nav>',
                    source,
                )
                self.assertIsNotNone(navigation, f"Missing primary navigation in {service}")
                self.assertIsNone(
                    re.search(r'<(?:House|ClipboardList|Store|Coins|ShieldCheck)\b', navigation.group()),
                    f"{service} primary navigation must use text labels without icons",
                )

    def test_every_account_menu_links_to_the_dedicated_profile_view(self):
        for service, path in PRIMARY_NAV_SOURCES.items():
            with self.subTest(service=service):
                self.assertRegex(
                    path.read_text(),
                    r'<a[^>]+href="/\?view=profile"[^>]*>Profile</a>',
                )

    def test_requester_errands_links_open_history_before_the_create_form(self):
        requester_landing = re.compile(
            r"\?\s*'/errands/mine'\s*:\s*'/errands/browse'"
        )
        for service, path in PRIMARY_NAV_SOURCES.items():
            with self.subTest(service=service):
                source = path.read_text()
                self.assertRegex(source, requester_landing)
                self.assertIn('href={errandsPath}', source)


class UpgradedCardPolishTest(unittest.TestCase):
    def test_errand_cards_use_a_neutral_edge_and_center_the_reward(self):
        css = (ROOT / "order-service/frontend/src/styles.css").read_text()
        self.assertEqual("1px solid var(--line)", declarations(css, ".errand-card").get("border"))
        self.assertEqual("none", declarations(css, ".errand-card::before").get("display"))
        for selector in (".reward", ".reward strong", ".reward small"):
            with self.subTest(selector=selector):
                self.assertEqual("center", declarations(css, selector).get("text-align"))

    def test_supplier_cards_do_not_draw_a_coloured_top_edge(self):
        css = (
            ROOT / "supplier-service/frontend/src/components/DirectoryComponents.module.css"
        ).read_text()
        self.assertNotIn(".card::before", css)

    def test_notification_cards_do_not_draw_a_coloured_left_edge(self):
        css = (ROOT / "notification-service/frontend/src/styles.css").read_text()
        self.assertNotIn(".notification-item::before", css)


if __name__ == "__main__":
    unittest.main()
