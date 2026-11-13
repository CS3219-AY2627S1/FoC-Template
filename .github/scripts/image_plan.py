"""Select service images for a main-branch push; never access registry credentials."""

import json
import os
from pathlib import Path
import re
import subprocess


SERVICES = ("gateway-service", "user-service", "supplier-service", "credit-service", "order-service", "admin-service",
            "notification-service", "chat-service")
NO_IMAGE_SENTINEL = "no-image"


def is_image_input(path, service):
    if not path.startswith(service + "/"):
        return False
    relative = path[len(service) + 1:]
    # These Dockerfiles do not package deployment files or root-level service docs.
    return not (relative.startswith("k8s/") or ("/" not in relative and relative.endswith(".md")))


def select_services(paths):
    # Changes to the publisher/checks themselves exercise every build on their first merge.
    if any(path.startswith((".github/workflows/", ".github/scripts/", "deploy/aws/")) for path in paths):
        return list(SERVICES)
    return [service for service in SERVICES if any(is_image_input(path, service) for path in paths)]


def service_matrix(services):
    """Keep GitHub's matrix non-empty even when the guarded publisher will be skipped."""
    return {"service": services or [NO_IMAGE_SENTINEL]}


def release_tag(sha, run_id, attempt):
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Expected the full GitHub commit SHA")
    if not re.fullmatch(r"[1-9][0-9]*", run_id) or not re.fullmatch(r"[1-9][0-9]*", attempt):
        raise ValueError("Expected positive GitHub run ID and attempt")
    # A rerun must not replace the image published by an earlier attempt.
    return f"sha-{sha}-r{run_id}-{attempt}"


def changed_paths(before, sha):
    if not re.fullmatch(r"[0-9a-f]{40}", before) or before == "0" * 40:
        return None
    exists = subprocess.run(["git", "cat-file", "-e", f"{before}^{{commit}}"],
                            capture_output=True, check=False)
    if exists.returncode:
        return None
    result = subprocess.run(["git", "diff", "--no-renames", "--name-only", "-z", before, sha],
                            check=True, capture_output=True)
    return result.stdout.decode("utf-8").rstrip("\0").split("\0") if result.stdout else []


def changed_paths_from_parents(ref="HEAD"):
    """Return the union of paths changed against every parent of a deployment commit."""
    parent_result = subprocess.run(["git", "show", "-s", "--format=%P", ref],
                                   check=True, capture_output=True)
    parents = parent_result.stdout.decode("utf-8").strip().split()
    paths = set()
    for parent in parents:
        result = subprocess.run(["git", "diff", "--no-renames", "--name-only", "-z", parent, ref],
                                check=True, capture_output=True)
        if result.stdout:
            paths.update(result.stdout.decode("utf-8").rstrip("\0").split("\0"))
    return sorted(paths)


def main():
    if os.environ.get("GITHUB_EVENT_NAME") != "push" or os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise ValueError("Image planning is permitted only for pushes to main")
    sha = os.environ["GITHUB_SHA"]
    tag = release_tag(sha, os.environ["GITHUB_RUN_ID"], os.environ["GITHUB_RUN_ATTEMPT"])
    paths = changed_paths(os.environ.get("BEFORE_SHA", ""), sha)
    services = list(SERVICES) if paths is None else select_services(paths)
    outputs = {
        "matrix": json.dumps(service_matrix(services), separators=(",", ":")),
        "has-images": str(bool(services)).lower(),
    }
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        for name, value in outputs.items():
            output.write(f"{name}={value}\n")
    summary = "## Image publishing plan\n\n"
    summary += ("Selected: " + ", ".join(services) + f"\n\nTag: `{tag}`\n") if services else \
        "No service/build-workflow changes; no new images are needed.\n"
    summary += "\nImages publish only after all CI checks pass. This does not deploy to Minikube.\n"
    with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a", encoding="utf-8") as output:
        output.write(summary)


if __name__ == "__main__":
    main()
