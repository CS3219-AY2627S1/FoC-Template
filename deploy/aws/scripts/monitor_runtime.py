# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-08
# Scope: Implemented bounded host/container/HTTP collection and CloudWatch publication.
# Author review: I validated correctness and added boundary checks where needed.

"""Publish bounded host/container health metadata; never inspect application secrets or data."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

from cloud_config import PROJECT_IDS, ROOT
from release_manifest import APPLICATIONS, ARTIFACTS

NAMESPACE = "FoC/Runtime"
LOG_GROUP = "/foc/monitoring/health"
STATE = ROOT / ".monitoring-state"
APPLICATION_NAMES = {f"foc-cloud-{name}-1": name for name in APPLICATIONS}
SUPPORT_NAMES = {
    "foc-cloud-rabbitmq-1": "rabbitmq",
    "foc-cloud-mailpit-1": "mailpit",
    **{f"supabase_db_{project}": f"{service}-database" for service, project in PROJECT_IDS.items()},
}
EXPECTED = {**APPLICATION_NAMES, **SUPPORT_NAMES}
HEALTH_CHECKED = set(ARTIFACTS) | set(SUPPORT_NAMES.values())
PUBLIC_ROUTES = {"/healthz": 200, "/sign-in": 200, "/v1/orders": 401, "/v1/wallets/me": 401}
INSPECT_FORMAT = (
    '{"name":{{json .Name}},"running":{{json .State.Running}},'
    '"health":{{with (index .State "Health")}}{{json .Status}}{{else}}null{{end}},'
    '"restarts":{{json .RestartCount}}}'
)


class MonitoringError(RuntimeError):
    pass


def execute(arguments: list[str], *, already_exists: bool = False) -> str:
    try:
        result = subprocess.run(arguments, capture_output=True, text=True, timeout=15, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise MonitoringError("Monitoring dependency unavailable or timed out.") from None
    if result.returncode:
        if already_exists and "ResourceAlreadyExistsException" in result.stderr:
            return ""
        raise MonitoringError("Monitoring dependency failed; provider output withheld.")
    return result.stdout


def validate_config(value: object) -> dict:
    if not isinstance(value, dict) or set(value) != {
        "account_id",
        "instance_id",
        "region",
        "public_origin",
    }:
        raise ValueError("Use only the documented monitoring configuration fields.")
    if (
        not re.fullmatch(r"[0-9]{12}", str(value["account_id"]))
        or not re.fullmatch(r"i-[a-f0-9]{17}", str(value["instance_id"]))
        or value["region"] != "ap-southeast-1"
        or not re.fullmatch(r"https://d[a-z0-9]+\.cloudfront\.net", str(value["public_origin"]))
    ):
        raise ValueError("Use the deployment's account, instance and Singapore region.")
    return value


def public_routes(origin: str) -> dict[str, int | None]:
    def probe(path):
        request = urllib.request.Request(origin + path, headers={"User-Agent": "FoC-Monitoring"})
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                return response.status
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            return status
        except (OSError, urllib.error.URLError):
            return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(PUBLIC_ROUTES)) as executor:
        return dict(zip(PUBLIC_ROUTES, executor.map(probe, PUBLIC_ROUTES), strict=True))


def memory_percent(text: str) -> float:
    values = {}
    for line in text.splitlines():
        key, _, raw = line.partition(":")
        if key in {"MemTotal", "MemAvailable"}:
            values[key] = int(raw.split()[0])
    total, available = values["MemTotal"], values["MemAvailable"]
    if total <= 0 or not 0 <= available <= total:
        raise ValueError("Invalid host memory counters.")
    return round(100 * (total - available) / total, 2)


def container_states() -> dict:
    # Restrict inspection to state fields. Full inspect includes environment secrets.
    prefix = ["docker"] if os.geteuid() == 0 else ["sudo", "-n", "docker"]
    present = set(execute([*prefix, "ps", "--all", "--format", "{{.Names}}"]).splitlines())
    names = sorted(present & set(EXPECTED))
    if not names:
        return {}
    result = {}
    for line in execute([*prefix, "inspect", "--format", INSPECT_FORMAT, *names]).splitlines():
        item = json.loads(line)
        name = str(item["name"]).removeprefix("/")
        if name in EXPECTED:
            if (
                not isinstance(item["running"], bool)
                or type(item["restarts"]) is not int
                or item["restarts"] < 0
                or item["health"] not in {None, "healthy", "unhealthy", "starting"}
            ):
                raise ValueError("Invalid container state metadata.")
            result[name] = item
    return result


def snapshot(
    config: dict,
    states: dict,
    previous: dict,
    memory: float,
    disk: float,
    routes: dict[str, int | None],
) -> dict:
    if not all(0 <= value <= 100 for value in (memory, disk)):
        raise ValueError("Invalid host utilization.")
    issues = []
    app_bad = support_bad = 0
    for name, workload in EXPECTED.items():
        state = states.get(name)
        delta = max(0, state["restarts"] - previous.get(name, 0)) if state else 0
        bad = (
            state is None
            or not state["running"]
            or state["health"] in {"starting", "unhealthy"}
            or (workload in HEALTH_CHECKED and state["health"] != "healthy")
            or delta >= 3
        )
        if bad:
            app_bad += name in APPLICATION_NAMES
            support_bad += name in SUPPORT_NAMES
            issues.append(
                {
                    "workload": workload,
                    "running": bool(state and state["running"]),
                    "health": state["health"] if state else "missing",
                    "restart_delta": delta,
                }
            )
    return {
        "version": 1,
        "at": datetime.now(UTC).isoformat(),
        "instance_id": config["instance_id"],
        "metrics": {
            "MemoryUsedPercent": memory,
            "RootDiskUsedPercent": disk,
            "ApplicationUnhealthyCount": app_bad,
            "SupportingUnhealthyCount": support_bad,
            "PublicRouteUnhealthyCount": sum(
                routes.get(path) != code for path, code in PUBLIC_ROUTES.items()
            ),
            "CollectorHeartbeat": 1,
        },
        "issues": issues,
        "public_routes": {path: routes.get(path) for path in PUBLIC_ROUTES},
    }


def publish(config: dict, record: dict) -> None:
    def aws(*arguments, already_exists=False):
        return execute(
            ["aws", *arguments, "--region", config["region"], "--no-cli-pager"],
            already_exists=already_exists,
        )

    aws(
        "logs",
        "create-log-stream",
        "--log-group-name",
        LOG_GROUP,
        "--log-stream-name",
        config["instance_id"],
        already_exists=True,
    )
    event = {
        "timestamp": int(datetime.fromisoformat(record["at"]).timestamp() * 1000),
        "message": json.dumps(record, separators=(",", ":")),
    }
    aws(
        "logs",
        "put-log-events",
        "--log-group-name",
        LOG_GROUP,
        "--log-stream-name",
        config["instance_id"],
        "--log-events",
        json.dumps([event]),
    )
    metrics = [
        {
            "MetricName": name,
            "Dimensions": [{"Name": "InstanceId", "Value": config["instance_id"]}],
            "Timestamp": record["at"],
            "Unit": "Percent" if name.endswith("Percent") else "Count",
            "Value": value,
        }
        for name, value in record["metrics"].items()
    ]
    # Publish heartbeat last, only after the sanitized health record is accepted.
    aws(
        "cloudwatch",
        "put-metric-data",
        "--namespace",
        NAMESPACE,
        "--metric-data",
        json.dumps(metrics),
    )


def save_state(path: Path, states: dict) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=".monitor-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            os.chmod(temporary, 0o600)
            json.dump({name: state["restarts"] for name, state in states.items()}, stream)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=STATE / "config.json")
    parser.add_argument(
        "--dry-run", action="store_true", help="Read health; do not publish or save state"
    )
    args = parser.parse_args()
    try:
        if os.name != "posix":
            raise MonitoringError("Run the collector on the Linux EC2 host.")
        config = validate_config(json.loads(args.config.read_text(encoding="utf-8")))
        state_path = args.config.parent / "previous.json"
        previous = json.loads(state_path.read_text()) if state_path.exists() else {}
        if not isinstance(previous, dict) or any(
            name not in EXPECTED or type(value) is not int or value < 0
            for name, value in previous.items()
        ):
            raise ValueError("Invalid previous monitoring state.")
        docker_unavailable = False
        try:
            states = container_states()
        except MonitoringError:
            states, docker_unavailable = {}, True
        usage = shutil.disk_usage("/")
        record = snapshot(
            config,
            states,
            previous,
            memory_percent(Path("/proc/meminfo").read_text()),
            round(100 * usage.used / usage.total, 2),
            public_routes(config["public_origin"]),
        )
        record["docker_unavailable"] = docker_unavailable
        if not args.dry_run:
            publish(config, record)
            save_state(state_path, states)
        print(json.dumps(record))
    except (MonitoringError, OSError, ValueError, KeyError, TypeError, ZeroDivisionError) as error:
        message = (
            str(error) if isinstance(error, MonitoringError) else "Monitoring metadata invalid."
        )
        raise SystemExit(message) from None


if __name__ == "__main__":
    main()
