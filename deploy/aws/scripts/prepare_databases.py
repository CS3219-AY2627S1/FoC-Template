# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-02
# Scope: Implemented database provisioning, runtime-login setup and tooling invocation fixes.
# Author review: I validated correctness and added boundary checks where needed.

"""Provision six Supabase CLI database-only projects on this fresh EC2 sandbox.

Operator provisioning only: migrations remain in each service's existing history.
Never run this against a laptop, shared server or linked hosted Supabase project.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
import tomllib

from cloud_config import DATABASES, PROJECT_IDS, REPOSITORY, ROOT, load_database_secrets

TOOLING_IMAGE = "foc-cloud-tooling:node22-docker29"


class ProvisionError(RuntimeError):
    pass


def command(arguments: list[str], *, input_text: str | None = None, timeout=900):
    # Suppress credentials, SQL and dependency output, including exceptions' argv.
    return subprocess.run(
        arguments,
        input=input_text,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def docker(*arguments: str, input_text: str | None = None, timeout=900):
    prefix = ["sudo", "docker"] if os.getuid() != 0 else ["docker"]
    return command([*prefix, *arguments], input_text=input_text, timeout=timeout)


def cli(service: str, *arguments: str):
    path = str(REPOSITORY / f"{service}-service")
    repo = str(REPOSITORY)
    return docker(
        "run",
        "--rm",
        "--network",
        "host",
        "--mount",
        f"type=bind,src={repo},dst={repo}",
        "--mount",
        "type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock",
        "--workdir",
        path,
        TOOLING_IMAGE,
        *arguments,
    )


def sql(service: str, password: str, statement: str):
    return docker(
        "exec",
        "-i",
        "--env",
        f"PGPASSWORD={password}",
        f"supabase_db_{PROJECT_IDS[service]}",
        "psql",
        "--host",
        "127.0.0.1",
        "--username",
        # Supabase's postgres role may be demoted by the image. Operator-only
        # settings/role hardening require its local internal administrative role.
        "supabase_admin",
        "--dbname",
        "postgres",
        "--no-password",
        "--no-psqlrc",
        "--set",
        "ON_ERROR_STOP=1",
        "--quiet",
        "--tuples-only",
        "--no-align",
        input_text=statement,
        timeout=30,
    )


def harden_sql(service: str, password: str) -> str:
    # Password format is validated before this function is used. Service is an enum.
    runtime = f"foc_{service}_runtime"
    return f"""
SET log_statement = 'none';
SET log_min_duration_statement = -1;
SET log_min_error_statement = 'panic';
BEGIN;
DO $cloud$
DECLARE login_role record;
BEGIN
    FOR login_role IN SELECT rolname FROM pg_roles
        WHERE rolcanlogin AND rolname <> '{runtime}'
    LOOP
        EXECUTE format('ALTER ROLE %I PASSWORD %L', login_role.rolname, '{password}');
    END LOOP;
END $cloud$;
COMMIT;
"""


def runtime_sql(service: str, password: str) -> str:
    _, schema, application_role = DATABASES[service]
    runtime = f"foc_{service}_runtime"
    grants = (
        f"GRANT {application_role} TO {runtime};"
        if application_role
        else f"GRANT USAGE ON SCHEMA {schema} TO {runtime};\n"
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA {schema} TO {runtime};\n"
        f"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA {schema} TO {runtime};"
    )
    allowed_role = application_role or ""
    return f"""
SET log_statement = 'none';
SET log_min_duration_statement = -1;
SET log_min_error_statement = 'panic';
BEGIN;
DO $cloud$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{runtime}') THEN
        CREATE ROLE {runtime} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOREPLICATION NOBYPASSRLS;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
        JOIN pg_roles member_role ON member_role.oid = m.member
        WHERE member_role.rolname = '{runtime}' AND r.rolname <> '{allowed_role}'
    ) THEN
        RAISE EXCEPTION 'Unexpected runtime role memberships';
    END IF;
END $cloud$;
ALTER ROLE {runtime} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOREPLICATION NOBYPASSRLS PASSWORD '{password}';
{grants}
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
GRANT CONNECT ON DATABASE postgres TO {runtime};
COMMIT;
"""


def safe_diagnostic(result) -> str:
    output = (result.stdout or "") + "\n" + (result.stderr or "")
    output = re.sub(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
        "[PRIVATE KEY REDACTED]",
        output,
        flags=re.DOTALL,
    )
    output = re.sub(
        r"(?i)\b(?:postgres(?:ql)?(?:\+[A-Za-z0-9_]+)?|amqps?|https?)://\S+",
        "[URL REDACTED]",
        output,
    )
    output = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[JWT REDACTED]", output)
    output = re.sub(r"\b[a-fA-F0-9]{64}\b", "[GENERATED SECRET REDACTED]", output)
    output = re.sub(r"\b(?:sb_(?:secret|publishable)_|sk-)[A-Za-z0-9_-]+", "[KEY REDACTED]", output)
    lines = []
    for line in output.splitlines():
        if not re.search(
            r"(?i)\b(error|failed|denied|not found|not supported|unknown command|unhealthy|timeout|fatal)\b",
            line,
        ):
            continue
        if re.search(
            r"(?i)\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER|TABLE|SCHEMA|DATABASE|INDEX|EXTENSION|FUNCTION)\b|\b(?:SELECT|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\s",
            line,
        ):
            continue
        line = re.sub(
            r"(?i)\b(password|secret|token|api[_ -]?key)\s*[:=].*",
            "[SENSITIVE DETAILS REDACTED]",
            line,
        )
        lines.append(line.strip())
    return " | ".join(lines[-3:])[:1200]


def checked(result, service: str, step: str):
    if result.returncode != 0:
        detail = safe_diagnostic(result)
        message = f"{service}: {step} failed."
        if detail:
            message += f" Diagnostic: {detail}"
        else:
            message += " Output suppressed to protect credentials."
        raise ProvisionError(message)
    return result


def prepare_tooling() -> None:
    context = str(ROOT / "tooling")
    checked(
        docker("build", "--quiet", "--tag", TOOLING_IMAGE, context),
        "tooling",
        "Node/Docker client build",
    )
    checked(
        docker("run", "--rm", TOOLING_IMAGE, "docker", "--version"),
        "tooling",
        "Docker client check",
    )


def harden_network(service: str, password: str) -> None:
    # CLI development defaults may trust local connections. Require real password
    # authentication on TCP rather than assuming that password rotation is enough.
    data_dir = checked(
        sql(service, password, "SHOW data_directory;"), service, "data path"
    ).stdout.strip()
    if not re.fullmatch(r"/[A-Za-z0-9/_-]+", data_dir):
        raise ProvisionError(f"{service}: unexpected data directory.")
    hba_file = data_dir + "/foc_cloud_pg_hba.conf"
    current = checked(sql(service, password, "SHOW hba_file;"), service, "HBA path").stdout.strip()
    hba = (
        "# Cloud SQL-only sandbox; retained in the owned database volume.\n"
        "local all postgres peer\n"
        "local all all scram-sha-256\n"
        "host all all 0.0.0.0/0 scram-sha-256\n"
        "host all all ::/0 scram-sha-256\n"
    )
    container = f"supabase_db_{PROJECT_IDS[service]}"
    checked(
        docker(
            "exec",
            "--user",
            "postgres",
            "-i",
            container,
            "sh",
            "-c",
            'umask 077; cat > "$1"',
            "sh",
            hba_file,
            input_text=hba,
        ),
        service,
        "TCP authentication file",
    )
    if current != hba_file:
        checked(
            sql(service, password, f"ALTER SYSTEM SET hba_file = '{hba_file}';"),
            service,
            "HBA configuration",
        )
        checked(docker("restart", container), service, "initial authentication restart")
    else:
        checked(
            sql(service, password, "SELECT pg_reload_conf();"), service, "authentication reload"
        )
    for _ in range(30):
        if sql(service, password, "SELECT 1;").returncode == 0:
            active_hba = checked(
                sql(service, password, "SHOW hba_file;"), service, "active HBA path"
            )
            if active_hba.stdout.strip() != hba_file:
                raise ProvisionError(
                    f"{service}: image overrides the required cloud authentication file."
                )
            return
        time.sleep(1)
    raise ProvisionError(f"{service}: database failed readiness after authentication hardening.")


def prepare(service: str, credentials: dict[str, str]) -> None:
    print(f"{service}: preparing its own database", flush=True)
    service_path = REPOSITORY / f"{service}-service"
    config = tomllib.loads((service_path / "supabase/config.toml").read_text(encoding="utf-8"))
    if (
        config["project_id"] != PROJECT_IDS[service]
        or config["db"]["port"] != DATABASES[service][0]
    ):
        raise ProvisionError(f"{service}: unexpected Supabase project ID.")
    expected_version = json.loads((service_path / "package.json").read_text())["devDependencies"][
        "supabase"
    ]
    installed_manifest = service_path / "node_modules/supabase/package.json"
    installed_version = (
        json.loads(installed_manifest.read_text())["version"]
        if installed_manifest.exists()
        else None
    )
    if installed_version != expected_version:
        checked(
            cli(service, "npm", "ci", "--no-audit", "--no-fund"), service, "pinned CLI installation"
        )
    container = f"supabase_db_{PROJECT_IDS[service]}"
    inspect = docker("inspect", "--type", "container", container)
    if inspect.returncode != 0:
        checked(
            cli(service, "./node_modules/.bin/supabase", "db", "start"), service, "database start"
        )
        inspect = checked(
            docker("inspect", "--type", "container", container), service, "database inspection"
        )
    info = json.loads(inspect.stdout)[0]
    if "supabase/postgres:" not in info["Config"]["Image"]:
        raise ProvisionError(f"{service}: container is not a Supabase PostgreSQL image.")
    bindings = info["HostConfig"]["PortBindings"].get("5432/tcp", [])
    if str(DATABASES[service][0]) not in {binding["HostPort"] for binding in bindings}:
        raise ProvisionError(f"{service}: unexpected published database port.")
    if not info["State"]["Running"]:
        checked(docker("start", container), service, "database resume")
    password = credentials["admin_password"]
    connected = False
    for _ in range(30):
        if sql(service, password, "SELECT 1;").returncode == 0:
            connected = True
            break
        if sql(service, "postgres", "SELECT 1;").returncode == 0:
            checked(
                sql(service, "postgres", harden_sql(service, password)),
                service,
                "initial password hardening",
            )
            connected = True
            break
        time.sleep(1)
    if not connected:
        raise ProvisionError(
            f"{service}: database is not ready or has unexpected existing credentials."
        )
    # A loopback connection may use a trust rule, so a successful probe alone must
    # never be treated as proof that default login passwords were already rotated.
    checked(sql(service, password, harden_sql(service, password)), service, "password hardening")
    harden_network(service, password)
    port = DATABASES[service][0]
    url = f"postgresql://postgres:{password}@127.0.0.1:{port}/postgres?sslmode=disable"
    checked(
        cli(service, "./node_modules/.bin/supabase", "migration", "up", "--db-url", url),
        service,
        "canonical migration application",
    )
    checked(
        sql(service, password, runtime_sql(service, credentials["runtime_password"])),
        service,
        "runtime role provisioning",
    )
    checked(docker("update", "--restart", "unless-stopped", container), service, "restart policy")
    print(f"{service}: migrated and restricted runtime login configured", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--ec2-sandbox",
        action="store_true",
        required=True,
        help="Explicitly target this dedicated cloud sandbox, never a laptop.",
    )
    parser.add_argument(
        "--service", choices=DATABASES, help="Apply one service's pending migrations."
    )
    args = parser.parse_args()
    try:
        if os.name != "posix":
            raise ProvisionError("Run only on the dedicated Linux EC2 sandbox.")
        state = load_database_secrets()
        prepare_tooling()
        for service in [args.service] if args.service else DATABASES:
            prepare(service, state[service])
    except (ValueError, OSError, KeyError, ProvisionError, subprocess.SubprocessError) as error:
        if isinstance(error, ProvisionError):
            raise SystemExit(str(error)) from None
        raise SystemExit(
            "Database preparation failed; diagnostic output suppressed to protect secrets."
        ) from None
    print(
        "Done. No database reset, application-table DDL history or cross-service data access was added."
    )


if __name__ == "__main__":
    main()
