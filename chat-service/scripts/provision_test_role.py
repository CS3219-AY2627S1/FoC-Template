# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
# Scope: Implemented local Chat test database role provisioning.
# Author review: I validated correctness and added boundary checks where needed.

"""Provision only the disposable loopback Chat Service test login after a clean reset."""

import json
import subprocess


def main():
    container = "supabase_db_foc-chat-service"
    bindings = json.loads(
        subprocess.check_output(
            ["docker", "inspect", "--format", "{{json .HostConfig.PortBindings}}", container],
            text=True,
        )
    )
    if bindings["5432/tcp"][0]["HostPort"] != "17422":
        raise ValueError("Expected isolated Chat Service port 17422")
    # Public, test-only local password. Never ALTER an existing login or read external secrets.
    sql = """DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='chat_test') THEN
        CREATE ROLE chat_test LOGIN PASSWORD 'local-chat-test-only';
      END IF;
    END $$;
    GRANT chat_runtime TO chat_test;
    """
    subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            container,
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
        ],
        input=sql,
        text=True,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    print("Isolated Chat Service test role provisioned")


if __name__ == "__main__":
    main()
