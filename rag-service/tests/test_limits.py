import unittest

from src.services.limits import RateLimiter, trim_conversation


def turn(role, content="x"):
    return {"role": role, "content": content}


class TrimConversationTest(unittest.TestCase):
    def test_keeps_a_short_conversation(self):
        conversation = [turn("user"), turn("assistant")]
        self.assertEqual(trim_conversation(conversation, 10), conversation)

    def test_never_starts_with_an_answer(self):
        conversation = [turn("user", "q1"), turn("assistant", "a1"), turn("user", "q2"), turn("assistant", "a2")]
        trimmed = trim_conversation(conversation, 3)
        self.assertEqual(trimmed, [turn("user", "q2"), turn("assistant", "a2")])

    def test_empty_when_nothing_is_left(self):
        self.assertEqual(trim_conversation([turn("assistant")], 10), [])


class RateLimiterTest(unittest.TestCase):
    def test_refuses_above_the_limit_and_allows_again_later(self):
        now = [0.0]
        limiter = RateLimiter(2, 60, clock=lambda: now[0])

        self.assertTrue(limiter.allow("alice"))
        self.assertTrue(limiter.allow("alice"))
        self.assertFalse(limiter.allow("alice"))
        # Another account has its own count.
        self.assertTrue(limiter.allow("bob"))

        now[0] = 60.0
        self.assertTrue(limiter.allow("alice"))


if __name__ == "__main__":
    unittest.main()
