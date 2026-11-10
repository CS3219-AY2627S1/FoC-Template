# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-06
# Scope: Implemented image deployment, readiness checks, release-state handling and rollback.
# Author review: I validated correctness and added boundary checks where needed.

"""Apply reviewed migrations, then digest-pinned application releases on EC2."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlencode

from cloud_config import REPOSITORY, ROOT, load_database_secrets, read_environment
from prepare_databases import sql
from release_manifest import (
    APPLICATIONS,
    ARTIFACTS,
    GROUPS,
    checksum,
    configuration,
    migrations,
    validate_manifest,
)
from release_migrations import (
    POLICY,
    MigrationError,
    MigrationRelease,
    run_packaged_cli,
    sql_history,
)


class ReleaseError(RuntimeError):
    pass


def atomic_json(path: Path, value: dict) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=".release-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            os.chmod(temporary, 0o600)
            json.dump(value, stream, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def command(
    arguments: list[str], *, input_text: str | None = None, environment=None, timeout=120
) -> str:
    try:
        result = subprocess.run(
            arguments,
            input=input_text,
            env=environment,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise ReleaseError(
            "Deployment command unavailable or timed out; output withheld."
        ) from None
    if result.returncode:
        raise ReleaseError("Deployment command failed; output withheld to protect credentials.")
    return result.stdout


class Runtime:
    def __init__(self, root: Path = ROOT):
        self.root = root

    def docker(self, *arguments: str, **kwargs) -> str:
        return command(["sudo", "docker", *arguments], **kwargs)

    def inspect(self) -> dict:
        ids = self.docker(
            "ps", "--all", "--quiet", "--filter", "label=com.docker.compose.project=foc-cloud"
        ).split()
        if not ids:
            raise ReleaseError(
                "Existing foc-cloud containers are missing; bootstrap manually first."
            )
        result = {}
        for container in json.loads(self.docker("inspect", *ids)):
            labels = container["Config"].get("Labels", {})
            if labels.get("com.docker.compose.oneoff", "False").lower() == "true":
                continue
            name = labels.get("com.docker.compose.service")
            if name in result:
                raise ReleaseError("Expected one container per cloud workload.")
            result[name] = {
                "image": container["Image"],
                "running": container["State"]["Running"],
                "health": container["State"].get("Health", {}).get("Status"),
                "restarts": container.get("RestartCount", 0),
            }
        return result

    def database_versions(self) -> dict[str, list[str]]:
        versions = {}
        for service, credentials in load_database_secrets(self.root).items():
            try:
                result = sql(
                    service,
                    credentials["admin_password"],
                    "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;",
                )
            except (OSError, subprocess.TimeoutExpired):
                # TimeoutExpired can include the psql command's PGPASSWORD argument.
                raise ReleaseError(
                    f"{service}: migration metadata query unavailable; output withheld."
                ) from None
            if result.returncode:
                raise ReleaseError(f"{service}: cannot read owned migration metadata; no rollout.")
            versions[service] = result.stdout.split()
        return versions

    @contextmanager
    def source(self, manifest: dict, repo: Path):
        # Fetch source data only. Do not switch the host checkout or execute any
        # release-supplied Python/shell code. The installed operator remains fixed.
        upstream = "https://github.com/AY2627S1-CS3219-P6/foc.git"
        command(["git", "-C", str(repo), "fetch", "--no-tags", upstream, "main"])
        commit = manifest["commit"]
        command(["git", "-C", str(repo), "merge-base", "--is-ancestor", commit, "FETCH_HEAD"])
        inventory = command(
            ["git", "-C", str(repo), "ls-tree", "-r", "--name-only", commit]
        ).splitlines()
        expected = {
            f"{service}-service/supabase/migrations/{name}"
            for service, entries in manifest["migrations"].items()
            for name in entries
        }
        observed = {
            name
            for name in inventory
            if any(
                name.startswith(f"{service}-service/supabase/migrations/")
                for service in manifest["migrations"]
            )
            and name.endswith(".sql")
        }
        if observed != expected:
            raise ReleaseError("Source migration inventory differs from the release manifest.")
        paths = {*expected, *manifest["configuration"], POLICY}
        for service in manifest["migrations"]:
            paths.update(
                (f"{service}-service/package.json", f"{service}-service/supabase/config.toml")
            )
        with tempfile.TemporaryDirectory(
            prefix="source-", dir=self.root / ".release-state"
        ) as directory:
            source = Path(directory)
            for name in sorted(paths):
                path = source / name
                path.parent.mkdir(parents=True, exist_ok=True)
                content = command(["git", "-C", str(repo), "show", f"{commit}:{name}"])
                path.write_text(content, encoding="utf-8", newline="\n")
            if (
                migrations(source) != manifest["migrations"]
                or configuration(source) != manifest["configuration"]
                or checksum(source / POLICY) != manifest["migration_policy"]
            ):
                raise ReleaseError("Release source fingerprints do not match the manifest.")
            yield source

    def migrate(self, service: str, source: Path) -> None:
        installed = REPOSITORY / f"{service}-service/node_modules/supabase"
        expected = json.loads((source / f"{service}-service/package.json").read_text())[
            "devDependencies"
        ]["supabase"]
        if json.loads((installed / "package.json").read_text())["version"] != expected:
            raise MigrationError(f"{service}: install the pinned Supabase CLI before release.")
        credentials = load_database_secrets(self.root)[service]
        from cloud_config import DATABASES

        # Short lock waits protect the old app during expand migrations. Bound
        # statements as well as the CLI process; output/URLs are never printed.
        query = urlencode(
            {"sslmode": "disable", "options": "-c lock_timeout=5s -c statement_timeout=120s"}
        )
        url = f"postgresql://postgres:{credentials['admin_password']}@127.0.0.1:{DATABASES[service][0]}/postgres?{query}"
        run_packaged_cli(installed.parent, source / f"{service}-service", url)

    def pull(self, manifest: dict) -> None:
        registry = f"{manifest['account_id']}.dkr.ecr.ap-southeast-1.amazonaws.com"
        # Use a temporary Docker login directory, not permanent credentials in the host home.
        with tempfile.TemporaryDirectory(
            prefix=".ecr-", dir=self.root / ".release-state"
        ) as directory:
            os.chmod(directory, 0o700)
            password = command(
                ["aws", "ecr", "get-login-password", "--region", "ap-southeast-1"], timeout=30
            )
            self.docker(
                "--config",
                directory,
                "login",
                "--username",
                "AWS",
                "--password-stdin",
                registry,
                input_text=password,
                timeout=30,
            )
            for artifact in ARTIFACTS:
                self.docker(
                    "--config", directory, "pull", manifest["images"][artifact], timeout=120
                )

    def apply(self, overlay: Path, services: list[str]) -> None:
        self.docker(
            "compose",
            "--project-name",
            "foc-cloud",
            "--env-file",
            str(self.root / ".env"),
            "-f",
            str(self.root / "compose.yaml"),
            "-f",
            str(self.root / "compose.public.yaml"),
            "-f",
            str(overlay),
            "--profile",
            "chat",
            "--profile",
            "admin",
            "--profile",
            "voice-assist",
            "up",
            "--detach",
            "--no-build",
            "--no-deps",
            "--pull",
            "never",
            *services,
            timeout=120,
        )

    def ready(self) -> None:
        deadline = time.monotonic() + 180
        stable = None
        while time.monotonic() < deadline:
            containers = self.inspect()
            expected = (*APPLICATIONS, "rabbitmq", "mailpit")
            good = all(
                name in containers
                and containers[name]["running"]
                and containers[name]["health"] in {None, "healthy"}
                for name in expected
            )
            restarts = {
                name: containers[name]["restarts"] for name in expected if name in containers
            }
            try:
                with urllib.request.urlopen("http://127.0.0.1:8080/healthz", timeout=5) as response:
                    good = good and response.status == 200
            except (OSError, urllib.error.URLError):
                good = False
            if (
                good
                and stable is not None
                and stable[0] == restarts
                and time.monotonic() - stable[1] >= 5
            ):
                return
            if not good or stable is None or stable[0] != restarts:
                stable = (restarts, time.monotonic()) if good else None
            time.sleep(2)
        raise ReleaseError("Application readiness or short worker stability check failed.")


class Releases:
    def __init__(self, root: Path = ROOT, repo: Path = REPOSITORY, runtime=None):
        self.root, self.repo = root, repo
        self.state = root / ".release-state"
        self.state.mkdir(mode=0o700, exist_ok=True)
        self.runtime = runtime or Runtime(root)

    def verify_database_versions(self, history: dict) -> None:
        wanted = {
            service: sorted(name.split("_", 1)[0] for name in entries)
            for service, entries in history.items()
        }
        if self.runtime.database_versions() != wanted:
            raise ReleaseError(
                "Database migration versions differ. Apply/review migrations manually before release."
            )

    def baseline(self) -> None:
        history = migrations(self.repo)
        self.verify_database_versions(history)
        atomic_json(
            self.state / "schema.json", {"version": 2, "migrations": sql_history(self.repo)}
        )
        print(
            "Recorded canonical migration fingerprints after checking all six owned migration histories. No DDL ran."
        )

    def preflight(self, manifest: dict | None = None) -> dict:
        baseline = json.loads((self.state / "schema.json").read_text(encoding="utf-8"))
        if manifest is None:
            if baseline.get("version") == 2:
                history = baseline["migrations"]
            else:
                history = migrations(self.repo)
                if baseline != {"migrations": history}:
                    raise ReleaseError(
                        "Installed migration history changed; operator review required."
                    )
            self.verify_database_versions(history)
        if manifest is not None:
            validate_manifest(manifest)
            if manifest["configuration"] != configuration(self.repo):
                raise ReleaseError(
                    "Cloud Compose/Nginx configuration changed; update the installed contract manually first."
                )
        containers = self.runtime.inspect()
        if any(name not in containers for name in APPLICATIONS):
            raise ReleaseError(
                "Existing application inventory is incomplete; bootstrap manually first."
            )
        if any(not containers.get(name, {}).get("running") for name in ("rabbitmq", "mailpit")):
            raise ReleaseError("Existing supporting containers must be running before deployment.")
        return containers

    def snapshot(self, containers: dict) -> dict:
        images = {name: containers[name]["image"] for name in APPLICATIONS}
        if any(
            not isinstance(image, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", image)
            for image in images.values()
        ):
            raise ReleaseError("Cannot pin existing images for rollback.")
        return {
            "configuration": configuration(self.repo),
            "images": images,
            "recorded_at": datetime.now(UTC).isoformat(),
        }

    def overlay(self, images: dict) -> Path:
        path = self.state / "active.compose.json"
        atomic_json(path, {"services": {name: {"image": image} for name, image in images.items()}})
        return path

    def record(self, release_id: str, outcome: str, **fields) -> None:
        path = self.state / "history.jsonl"
        line = {
            "release_id": release_id,
            "outcome": outcome,
            "at": datetime.now(UTC).isoformat(),
            **fields,
        }
        descriptor = os.open(path, os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "a", encoding="utf-8") as stream:
            stream.write(json.dumps(line) + "\n")
        print(json.dumps(line))

    def deploy(self, manifest: dict) -> None:
        containers = self.preflight(manifest)
        previous = self.snapshot(containers)
        with self.runtime.source(manifest, self.repo) as source:
            # Download all application images before changing any schema. Existing
            # application containers keep running while expand migrations execute.
            self.runtime.pull(manifest)
            MigrationRelease(self.state, self.repo, self.runtime, atomic_json).apply(source)
        images = {
            name: manifest["images"][artifact]
            for artifact, group in GROUPS.items()
            for name in group
        }
        self.record(manifest["release_id"], "STARTED", commit=manifest["commit"])
        try:
            overlay = self.overlay(images)
            self.runtime.apply(overlay, list(APPLICATIONS))
            self.runtime.ready()
            atomic_json(self.state / "previous.json", previous)
            atomic_json(
                self.state / "current.json",
                {"manifest": manifest, "recorded_at": datetime.now(UTC).isoformat()},
            )
        except (ReleaseError, OSError, ValueError):
            try:
                self.runtime.apply(self.overlay(previous["images"]), list(APPLICATIONS))
                self.runtime.ready()
                atomic_json(
                    self.state / "current.json",
                    {"rollback": previous, "recorded_at": datetime.now(UTC).isoformat()},
                )
            except (ReleaseError, OSError, ValueError):
                self.record(manifest["release_id"], "ROLLBACK_FAILED")
                raise ReleaseError(
                    "Rollout and rollback checks failed; inspect the live host before another release."
                ) from None
            self.record(manifest["release_id"], "ROLLED_BACK")
            raise ReleaseError(
                "Rollout failed; previous application images restored and checked."
            ) from None
        self.record(manifest["release_id"], "DEPLOYED", commit=manifest["commit"])

    def rollback(self) -> None:
        containers = self.preflight()
        previous = json.loads((self.state / "previous.json").read_text(encoding="utf-8"))
        if previous["configuration"] != configuration(self.repo) or set(previous["images"]) != set(
            APPLICATIONS
        ):
            raise ReleaseError(
                "Previous configuration is incompatible; manual operator review required."
            )
        # Only snapshots recorded locally are accepted; never caller-supplied arbitrary image names.
        self.snapshot({name: {"image": image} for name, image in previous["images"].items()})
        current = self.snapshot(containers)
        try:
            self.runtime.apply(self.overlay(previous["images"]), list(APPLICATIONS))
            self.runtime.ready()
        except ReleaseError:
            try:
                self.runtime.apply(self.overlay(current["images"]), list(APPLICATIONS))
                self.runtime.ready()
            except ReleaseError:
                self.record("operator", "ROLLBACK_FAILED")
                raise ReleaseError(
                    "Operator rollback and restoration failed; inspect the live host."
                ) from None
            self.record("operator", "ROLLBACK_REJECTED_CURRENT_RESTORED")
            raise ReleaseError(
                "Previous images failed readiness; original running images restored."
            ) from None
        # Keep the same rollback target: repeating the operator action must not
        # toggle back to an image that the operator just rejected.
        atomic_json(
            self.state / "current.json",
            {"rollback": previous, "recorded_at": datetime.now(UTC).isoformat()},
        )
        self.record("operator", "ROLLBACK_DEPLOYED")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("baseline", "deploy", "rollback", "status"))
    parser.add_argument("--manifest-base64")
    args = parser.parse_args()
    try:
        if os.name != "posix" or os.getuid() == 0:
            raise ReleaseError("Run on EC2 as the existing non-root session user.")
        if read_environment(ROOT / ".env").get("FOC_USER_UID") != str(os.getuid()):
            raise ReleaseError("Deployment user must own the existing cloud configuration.")
        import fcntl

        release = Releases()
        with (release.state / "lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ReleaseError("Another deployment is already running.") from None
            if args.operation == "baseline":
                release.baseline()
            elif args.operation == "deploy":
                if not args.manifest_base64 or len(args.manifest_base64) > 60000:
                    raise ReleaseError("A bounded release manifest is required.")
                release.deploy(
                    validate_manifest(
                        json.loads(base64.b64decode(args.manifest_base64, validate=True))
                    )
                )
            elif args.operation == "rollback":
                release.rollback()
            else:
                for name, state in release.runtime.inspect().items():
                    print(json.dumps({"service": name, **state}))
    except (
        ReleaseError,
        ValueError,
        OSError,
        KeyError,
        TypeError,
        MigrationError,
        subprocess.TimeoutExpired,
    ) as error:
        if isinstance(error, (ReleaseError, MigrationError)):
            raise SystemExit(str(error)) from None
        raise SystemExit(
            "Release metadata/configuration invalid; no secret values printed."
        ) from None


if __name__ == "__main__":
    main()
