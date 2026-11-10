# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-06
# Scope: Implemented release preflight, CI artifact checks and SSM invocation helpers.
# Author review: I validated correctness and added boundary checks where needed.

"""GitHub runner helpers: verify source CI, assemble releases and invoke a fixed SSM document."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from release_manifest import REPOSITORY, SHA, create_manifest, validate_manifest


class WorkflowError(RuntimeError):
    pass


def execute(arguments: list[str]) -> dict:
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=60, check=False)
    if result.returncode:
        raise WorkflowError(
            "Cloud/GitHub operation failed; inspect permissions or session. Provider output withheld."
        )
    return json.loads(result.stdout)


def aws(*arguments: str) -> dict:
    return execute(
        ["aws", *arguments, "--region", "ap-southeast-1", "--output", "json", "--no-cli-pager"]
    )


def setting(name: str, pattern: str) -> str:
    value = os.environ.get(name, "")
    if not re.fullmatch(pattern, value):
        raise WorkflowError(
            f"Set the repository variable {name} as described in deploy/aws/DELIVERY.md."
        )
    return value


def source_ci(commit: str) -> int:
    repo = os.environ["GITHUB_REPOSITORY"]
    head = execute(["gh", "api", f"repos/{repo}/commits/main"])
    if head["sha"] != commit:
        raise WorkflowError(
            "Release source is no longer main HEAD; deploy the newer successful CI run."
        )
    runs = execute(
        [
            "gh",
            "api",
            f"repos/{repo}/actions/workflows/ci.yml/runs?event=push&head_sha={commit}&per_page=100",
        ]
    )
    successful = [
        run
        for run in runs["workflow_runs"]
        if run["head_sha"] == commit
        and run["head_branch"] == "main"
        and run["status"] == "completed"
        and run["conclusion"] == "success"
    ]
    if not successful:
        raise WorkflowError("This exact main commit has no successful push CI run.")
    return max(successful, key=lambda run: (run["run_number"], run.get("run_attempt", 1)))["id"]


def preflight(commit: str) -> bool:
    ci_run = source_ci(commit)
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as stream:
        stream.write(f"ci_run_id={ci_run}\n")
    account = setting("FOC_AWS_ACCOUNT_ID", r"[0-9]{12}")
    instance = setting("FOC_EC2_INSTANCE_ID", r"i-[a-f0-9]{17}")
    distribution = setting("FOC_CLOUDFRONT_ID", r"[A-Z0-9]{10,20}")
    if aws("sts", "get-caller-identity")["Account"] != account:
        raise WorkflowError("Unexpected AWS account; no deployment.")
    reservations = aws("ec2", "describe-instances", "--instance-ids", instance)["Reservations"]
    node = reservations[0]["Instances"][0]
    if node["State"]["Name"] != "running":
        print(
            "Deployment deferred: EC2 is stopped. Start it deliberately and use Run workflow to retry; no instance was started."
        )
        return False
    online = aws(
        "ssm", "describe-instance-information", "--filters", f"Key=InstanceIds,Values={instance}"
    )
    if not any(item["PingStatus"] == "Online" for item in online["InstanceInformationList"]):
        raise WorkflowError("EC2 is not online in SSM yet.")
    config = aws("cloudfront", "get-distribution-config", "--id", distribution)[
        "DistributionConfig"
    ]
    origins = [item for item in config["Origins"]["Items"] if item["Id"] == "foc-ec2"]
    if len(origins) != 1 or origins[0]["DomainName"] != node.get("PublicDnsName"):
        raise WorkflowError(
            "CloudFront origin does not match current EC2 DNS. Correct the existing origin first."
        )
    return True


def dispatch(operation: str, manifest_path: Path | None) -> None:
    commit = os.environ["FOC_SOURCE_SHA"]
    source_ci(commit)
    instance = setting("FOC_EC2_INSTANCE_ID", r"i-[a-f0-9]{17}")
    encoded = "e30="
    release_id = "operator"
    if operation == "deploy":
        manifest = validate_manifest(json.loads(manifest_path.read_text(encoding="utf-8")))
        if (
            manifest["commit"] != commit
            or manifest["account_id"] != os.environ["FOC_AWS_ACCOUNT_ID"]
        ):
            raise WorkflowError("Release source/account mismatch.")
        encoded = base64.b64encode(json.dumps(manifest).encode()).decode()
        release_id = manifest["release_id"]
    # There is no arbitrary shell command input: only the preinstalled fixed operator document.
    request = {
        "DocumentName": "FoC-DeployRelease",
        "DocumentVersion": "1",
        "InstanceIds": [instance],
        "Comment": f"FoC {operation} {release_id}",
        "TimeoutSeconds": 120,
        "Parameters": {"Operation": [operation], "Manifest": [encoded]},
    }
    path = Path(os.environ["RUNNER_TEMP"]) / "foc-ssm-request.json"
    path.write_text(json.dumps(request), encoding="utf-8")
    command_id = aws("ssm", "send-command", "--cli-input-json", f"file://{path}")["Command"][
        "CommandId"
    ]
    print(f"SSM command: {command_id}", flush=True)
    deadline = time.monotonic() + 2100
    invocation = None
    while time.monotonic() < deadline:
        # Newly created invocations may not be queryable immediately.
        result = subprocess.run(
            [
                "aws",
                "ssm",
                "get-command-invocation",
                "--command-id",
                command_id,
                "--instance-id",
                instance,
                "--region",
                "ap-southeast-1",
                "--output",
                "json",
                "--no-cli-pager",
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if not result.returncode:
            invocation = json.loads(result.stdout)
            if invocation["Status"] not in {"Pending", "InProgress", "Delayed", "Cancelling"}:
                break
        time.sleep(5)
    if not invocation or invocation["Status"] != "Success":
        # The fixed deployment helper emits metadata only; do not print arbitrary SSM stderr.
        if invocation:
            for line in invocation.get("StandardOutputContent", "").splitlines():
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                if isinstance(event, dict) and set(event) <= {
                    "release_id",
                    "outcome",
                    "at",
                    "commit",
                }:
                    print(json.dumps(event))
        raise WorkflowError(
            "Remote deployment failed or timed out. Check its sanitized release history/SSM command; do not start a concurrent rollout."
        )
    print(f"Remote {operation} completed with readiness checks.")
    origin = setting("FOC_PUBLIC_ORIGIN", r"https://d[a-z0-9]+\.cloudfront\.net")
    for _ in range(12):
        try:
            with urllib.request.urlopen(origin + "/healthz", timeout=10) as response:
                if response.status == 200:
                    print("Public HTTPS health check passed.")
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(5)
    raise WorkflowError(
        "Host rollout passed but public HTTPS check failed; inspect CloudFront/ingress before changing application images."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("preflight", "manifest", "deploy", "rollback"))
    parser.add_argument("--digests", type=Path)
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    try:
        commit = os.environ["FOC_SOURCE_SHA"]
        if not SHA.fullmatch(commit):
            raise WorkflowError("Invalid source commit.")
        if args.operation == "preflight":
            ready = preflight(commit)
            with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as stream:
                stream.write(f"deployable={str(ready).lower()}\n")
        elif args.operation == "manifest":
            manifest = create_manifest(
                REPOSITORY,
                args.digests,
                commit,
                os.environ["FOC_AWS_ACCOUNT_ID"],
                os.environ["GITHUB_RUN_ID"],
                os.environ["GITHUB_RUN_ATTEMPT"],
            )
            args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        else:
            dispatch(args.operation, args.manifest)
    except (WorkflowError, ValueError, KeyError, OSError, subprocess.TimeoutExpired, TypeError):
        # No provider error bodies, credential values, environment contents or tracebacks.
        import sys

        error = sys.exception()
        raise SystemExit(
            str(error)
            if isinstance(error, WorkflowError)
            else "Invalid release input/configuration; no credentials printed."
        ) from None


if __name__ == "__main__":
    main()
