# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11, 2026-10-21
# Scope: Implemented container and publisher smoke checks and corrected the test host port.
# Author review: I validated correctness and added boundary checks where needed.

"""Build/start/restart only disposable Chat Service containers; use isolated local dependencies."""

import asyncio
import json
import os
import subprocess

import httpx


def docker(*args, env=None):
    return subprocess.check_output(["docker", *args], env=env, text=True).strip()


async def verify():
    env = {
        **os.environ,
        "DATABASE_URL": "postgresql+asyncpg://chat_test:local-chat-test-only@host.docker.internal:17422/postgres",
        "RABBITMQ_URL": "amqp://guest:guest@host.docker.internal:17425/",
    }
    api, publisher = "foc-chat-smoke-api", "foc-chat-smoke-publisher"
    count_code = """import asyncio, os
from app.db import Database
from sqlalchemy import text
async def main():
    db=Database(os.environ['DATABASE_URL'])
    async with db.transaction() as session:
        rows=await session.execute(text('SELECT count(*) FROM chat_service.messages'))
        print(rows.scalar_one())
    await db.close()
asyncio.run(main())
"""
    created = []
    try:
        docker(
            "run",
            "--detach",
            "--name",
            api,
            "--publish",
            "127.0.0.1:8004:8003",
            "--env",
            "DATABASE_URL",
            "--env",
            "RABBITMQ_URL",
            "foc-chat-service:test",
            env=env,
        )
        created.append(api)
        docker(
            "run",
            "--detach",
            "--name",
            publisher,
            "--env",
            "DATABASE_URL",
            "--env",
            "RABBITMQ_URL",
            "foc-chat-service:test",
            "chat-outbox",
            env=env,
        )
        created.append(publisher)
        async with httpx.AsyncClient(timeout=3) as client:
            async with asyncio.timeout(30):
                while True:
                    try:
                        r = await client.get("http://127.0.0.1:8004/health/ready")
                        assert r.status_code == 200 and r.json()["delivery"] == "ready"
                        break
                    except (AssertionError, httpx.HTTPError):
                        await asyncio.sleep(0.2)
            before = int(docker("exec", api, "python", "-c", count_code))
            docker("restart", api)
            async with asyncio.timeout(20):
                while True:
                    try:
                        r = await client.get("http://127.0.0.1:8004/health/ready")
                        assert r.status_code == 200
                        break
                    except (AssertionError, httpx.HTTPError):
                        await asyncio.sleep(0.2)
        assert docker("inspect", "--format", "{{.State.Running}}", publisher) == "true"
        assert docker("exec", api, "id", "-u") != "0"
        assert int(docker("exec", api, "python", "-c", count_code)) == before
        print(
            json.dumps(
                {
                    "result": "passed",
                    "persistedMessageCount": before,
                    "checks": [
                        "non-root API",
                        "database readiness",
                        "broker subscription",
                        "independent publisher",
                        "API restart",
                    ],
                }
            )
        )
    finally:
        for name in created:
            docker("rm", "--force", name)


if __name__ == "__main__":
    asyncio.run(verify())
