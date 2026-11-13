import os
import unittest

# The client needs a key to be created. These tests only retrieve documents and never call Claude.
os.environ.setdefault("CLAUDE_API_KEY", "not-used-by-these-tests")

from src.services.rag_service import rag_system


class RetrievalTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rag = rag_system()

    def assert_retrieves(self, question, title):
        retrieved = self.rag.retrieve(question)
        titles = [document.splitlines()[0] for document in retrieved]
        self.assertIn(f"Title: {title}", titles)

    def test_forgotten_password_question(self):
        self.assert_retrieves("i forgot my password", "Forgotten password")

    def test_starting_credits_question(self):
        self.assert_retrieves("how many credits do i start with", "What credits are")

    def test_project_name_question(self):
        self.assert_retrieves("what is friend on campus", "What Relay is")


if __name__ == "__main__":
    unittest.main()
