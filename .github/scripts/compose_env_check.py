"""Fail fast when compose.yaml needs a variable that a Compose environment does not provide.

compose.yaml marks variables as required with ``${NAME:?message}``. Docker Compose resolves every
service before it starts any of them, so one missing variable breaks every ``docker compose`` call.
CI does not read ``.env``: each job lists its variables in ``.github/workflows/ci.yml``, and the
Kafka smoke script exports its own defaults. This check compares each of those, plus
``.env.example`` (what teammates copy), against compose.yaml and names exactly what is missing.

Run from the repository root: ``python3 .github/scripts/compose_env_check.py``.
"""

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]

# ${NAME:?message} or ${NAME?message}: Compose stops if NAME is unset or empty.
REQUIRED = re.compile(r"\$\{([A-Z][A-Z0-9_]*):?\?")
# A job-level "    env:" block followed by "      NAME: value" lines.
ENV_LINE = re.compile(r"^      ([A-Z][A-Z0-9_]*):")
EXPORT = re.compile(r"^export ([A-Z][A-Z0-9_]*)=")
ASSIGN = re.compile(r"^([A-Z][A-Z0-9_]*)=")
# Variables a CI step writes to $GITHUB_ENV at run time instead of listing in env:.
GITHUB_ENV_WRITE = re.compile(r'echo "([A-Z][A-Z0-9_]*)=.*>> "\$GITHUB_ENV"')


def required_variables(compose_text):
    return set(REQUIRED.findall(compose_text))


def compose_jobs(workflow_text):
    """Each job that runs docker compose, with the variables its env block and steps provide."""
    jobs = {}
    for match in re.finditer(r"^  ([a-z0-9-]+):\n(.*?)(?=^  [a-z0-9-]+:\n|\Z)", workflow_text, re.M | re.S):
        name, body = match.group(1), match.group(2)
        if "docker compose" not in body and "admin-service/scripts/runtime_smoke.py" not in body:
            continue
        provided = set()
        in_env = False
        for line in body.splitlines():
            if line == "    env:":
                in_env = True
                continue
            if in_env:
                if not line.strip() or line.lstrip().startswith("#"):
                    continue
                env_match = ENV_LINE.match(line)
                if env_match:
                    provided.add(env_match.group(1))
                    continue
                in_env = False
        provided.update(GITHUB_ENV_WRITE.findall(body))
        jobs[name] = provided
    return jobs


def exported_variables(script_text):
    return {match.group(1) for line in script_text.splitlines() if (match := EXPORT.match(line))}


def example_variables(example_text):
    return {match.group(1) for line in example_text.splitlines() if (match := ASSIGN.match(line))}


def missing_report(required, sources):
    """Return '<source>: missing A, B' lines for every source that lacks a required variable."""
    lines = []
    for source, provided in sources.items():
        missing = sorted(required - provided)
        if missing:
            lines.append(f"{source}: missing {', '.join(missing)}")
    return lines


def main(root=ROOT):
    required = required_variables((root / "compose.yaml").read_text())
    workflow = (root / ".github/workflows/ci.yml").read_text()
    sources = {f"ci.yml job '{job}'": provided for job, provided in compose_jobs(workflow).items()}
    smoke = root / "deploy/kafka/Test-LocalKafka.sh"
    if smoke.exists():
        sources["deploy/kafka/Test-LocalKafka.sh"] = exported_variables(smoke.read_text())
    sources[".env.example"] = example_variables((root / ".env.example").read_text())

    problems = missing_report(required, sources)
    if problems:
        print("compose.yaml requires variables these environments do not provide:")
        for problem in problems:
            print(f"  - {problem}")
        print("Add them wherever Compose runs (see .github/scripts/compose_env_check.py).")
        return 1
    print(f"OK: {len(required)} required Compose variables are provided by {len(sources)} environments.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
