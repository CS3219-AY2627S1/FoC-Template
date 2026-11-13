from pathlib import Path
import tempfile
import unittest

import compose_env_check

COMPOSE = """services:
  order-service:
    environment:
      DB_NAME: ${ORDER_DB_NAME:?ORDER_DB_NAME must be set}
      MODE: ${OPTIONAL_MODE:-}
      KEY: ${JWT_PRIVATE_KEY:?JWT_PRIVATE_KEY must be set}
"""

WORKFLOW = """jobs:
  unit:
    runs-on: ubuntu-24.04
    steps:
      - run: ./mvnw verify

  stack:
    runs-on: ubuntu-24.04
    env:
      ORDER_DB_NAME: order_db
    steps:
      - run: echo "JWT_PRIVATE_KEY=$key" >> "$GITHUB_ENV"
      - run: docker compose config --quiet
"""


class ComposeEnvCheckTests(unittest.TestCase):
    def test_only_required_variables_count(self):
        self.assertEqual({"ORDER_DB_NAME", "JWT_PRIVATE_KEY"}, compose_env_check.required_variables(COMPOSE))

    def test_only_jobs_that_run_compose_are_checked(self):
        jobs = compose_env_check.compose_jobs(WORKFLOW)
        self.assertEqual(["stack"], list(jobs))

    def test_env_block_and_github_env_writes_both_provide_variables(self):
        self.assertEqual({"ORDER_DB_NAME", "JWT_PRIVATE_KEY"}, compose_env_check.compose_jobs(WORKFLOW)["stack"])

    def test_delegated_admin_runtime_job_is_checked(self):
        workflow = WORKFLOW.replace("docker compose config --quiet", "python3 admin-service/scripts/runtime_smoke.py")
        self.assertEqual({"ORDER_DB_NAME", "JWT_PRIVATE_KEY"}, compose_env_check.compose_jobs(workflow)["stack"])

    def test_comments_in_environment_do_not_hide_variables(self):
        workflow = WORKFLOW.replace("    env:\n", "    env:\n      # Throwaway credentials\n\n")
        self.assertEqual({"ORDER_DB_NAME", "JWT_PRIVATE_KEY"}, compose_env_check.compose_jobs(workflow)["stack"])

    def test_names_the_job_and_variable_that_are_missing(self):
        workflow = WORKFLOW.replace("      ORDER_DB_NAME: order_db\n", "      OTHER: x\n")
        jobs = compose_env_check.compose_jobs(workflow)
        report = compose_env_check.missing_report({"ORDER_DB_NAME", "JWT_PRIVATE_KEY"}, jobs)
        self.assertEqual(["stack: missing ORDER_DB_NAME"], report)

    def test_reads_exports_and_example_assignments(self):
        self.assertEqual({"A", "B"}, compose_env_check.exported_variables("export A=${A:-x}\nexport B=1\necho hi"))
        self.assertEqual({"A", "B"}, compose_env_check.example_variables("# c\nA=\nB=value\n  C=indented"))

    def test_main_fails_and_reports_each_missing_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".github/workflows").mkdir(parents=True)
            (root / "compose.yaml").write_text(COMPOSE)
            (root / ".github/workflows/ci.yml").write_text(WORKFLOW)
            (root / ".env.example").write_text("JWT_PRIVATE_KEY=\n")
            self.assertEqual(1, compose_env_check.main(root))
            (root / ".env.example").write_text("JWT_PRIVATE_KEY=\nORDER_DB_NAME=order_db\n")
            self.assertEqual(0, compose_env_check.main(root))

    def test_the_repository_is_consistent(self):
        self.assertEqual(0, compose_env_check.main())


if __name__ == "__main__":
    unittest.main()
