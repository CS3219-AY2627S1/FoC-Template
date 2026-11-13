"""One configurable countdown, fixed initialization and independent credit retries."""

import os
import unittest
from unittest.mock import patch

from pydantic import ValidationError

from common.config_manager import Settings
from orders import deadlines


class TimeoutSettingsTests(unittest.TestCase):
    def settings(self, **environment):
        with patch.dict(os.environ, environment, clear=True):
            return Settings(_env_file=None)

    def assert_windows(self, settings, seconds):
        with patch.object(deadlines, "settings", settings):
            self.assertEqual(deadlines.init_window().total_seconds(), 60)
            for window in (deadlines.open_window, deadlines.progress_window, deadlines.settlement_window):
                self.assertEqual(window().total_seconds(), seconds)

    def test_shared_timeout_applies_only_to_post_initialization_stages(self):
        settings = self.settings(TIMEOUT_DURATION="30")
        self.assert_windows(settings, 30)
        self.assertEqual(settings.credit_result_timeout_seconds, 60)

    def test_obsolete_stage_overrides_cannot_change_deadlines(self):
        settings = self.settings(
            TIMEOUT_DURATION="900",
            ORDER_INIT_TIMEOUT_SECONDS="1",
            ORDER_OPEN_TIMEOUT_SECONDS="30",
            ORDER_PROGRESS_TIMEOUT_SECONDS="40",
            ORDER_SETTLEMENT_TIMEOUT_SECONDS="50",
        )
        self.assert_windows(settings, 900)

    def test_invalid_shared_timeout_is_rejected(self):
        for value in ("0", "-1", "1.5", "invalid"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                self.settings(TIMEOUT_DURATION=value)

    def test_default_timeouts_are_preserved(self):
        self.assert_windows(self.settings(), 900)

    def test_credit_retry_timeout_is_independent(self):
        settings = self.settings(TIMEOUT_DURATION="30", CREDIT_RESULT_TIMEOUT_SECONDS="10")
        self.assert_windows(settings, 30)
        self.assertEqual(settings.credit_result_timeout_seconds, 10)
