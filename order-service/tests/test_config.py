"""Shared countdown defaults and stage-specific environment overrides."""

import os
import unittest
from unittest.mock import patch

from pydantic import ValidationError

from common.config_manager import Settings


class TimeoutSettingsTests(unittest.TestCase):
    def settings(self, **environment):
        with patch.dict(os.environ, environment, clear=True):
            return Settings(_env_file=None)

    def test_shared_timeout_applies_only_to_post_initialization_stages(self):
        settings = self.settings(TIMEOUT_DURATION="30")
        self.assertEqual(settings.order_init_timeout_seconds, 60)
        self.assertEqual(settings.order_open_timeout_seconds, 30)
        self.assertEqual(settings.order_progress_timeout_seconds, 30)
        self.assertEqual(settings.order_settlement_timeout_seconds, 30)

    def test_specific_timeouts_override_shared_default(self):
        settings = self.settings(
            TIMEOUT_DURATION="30",
            ORDER_OPEN_TIMEOUT_SECONDS="40",
            ORDER_PROGRESS_TIMEOUT_SECONDS="50",
            ORDER_SETTLEMENT_TIMEOUT_SECONDS="60",
        )
        self.assertEqual(settings.order_open_timeout_seconds, 40)
        self.assertEqual(settings.order_progress_timeout_seconds, 50)
        self.assertEqual(settings.order_settlement_timeout_seconds, 60)

    def test_invalid_shared_timeout_is_rejected(self):
        for value in ("0", "-1", "1.5", "invalid"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                self.settings(TIMEOUT_DURATION=value)

    def test_default_timeouts_are_preserved(self):
        settings = self.settings()
        self.assertEqual(settings.order_open_timeout_seconds, 900)
        self.assertEqual(settings.order_progress_timeout_seconds, 900)
        self.assertEqual(settings.order_settlement_timeout_seconds, 900)
