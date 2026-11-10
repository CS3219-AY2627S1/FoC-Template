#!/usr/bin/env python3
# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
# Scope: Implemented the D2 timing measurement helper.
# Author review: I validated correctness and added boundary checks where needed.

"""Measure local p95 registration, login, profile-read, and profile-write timings.

Run against the local D2 stack. Supply a verified timing account through the
environment variables named by the flags; no credentials, access tokens, or
individual request timings are printed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
from statistics import mean
from time import perf_counter
from uuid import uuid4

import httpx


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--samples", type=int, default=10)
    parser.add_argument("--email-env", default="D2_TIMING_EMAIL")
    parser.add_argument("--password-env", default="D2_TIMING_PASSWORD")
    parser.add_argument("--registration-password-env", default="D2_TIMING_REGISTRATION_PASSWORD")
    return parser.parse_args()


def percentile_95(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[math.ceil(len(ordered) * 0.95) - 1]


async def timed_request(
    client: httpx.AsyncClient,
    *args,
    **kwargs,
) -> tuple[httpx.Response, float]:
    started_at = perf_counter()
    response = await client.request(*args, **kwargs)
    return response, perf_counter() - started_at


async def measure(arguments: argparse.Namespace) -> None:
    if arguments.samples < 1:
        raise RuntimeError("--samples must be at least 1.")
    email = os.getenv(arguments.email_env)
    password = os.getenv(arguments.password_env)
    registration_password = os.getenv(arguments.registration_password_env, password or "")
    if not email or not password or not registration_password:
        raise RuntimeError(
            "Configure the requested timing-account and registration-password variables."
        )

    timings: dict[str, list[float]] = {
        "registration": [],
        "login": [],
        "profileRead": [],
        "profileWrite": [],
    }
    async with httpx.AsyncClient(base_url=arguments.base_url, timeout=20) as client:
        for index in range(arguments.samples):
            suffix = uuid4().hex[:12]
            registration, registration_elapsed = await timed_request(
                client,
                "POST",
                "/v1/auth/registrations",
                json={
                    "username": f"timing-{suffix}",
                    "email": f"timing-{suffix}@u.nus.edu",
                    "password": registration_password,
                },
            )
            if registration.status_code != 202:
                raise RuntimeError(
                    f"registration measurement failed with HTTP {registration.status_code}."
                )
            timings["registration"].append(registration_elapsed * 1_000)

            login, login_elapsed = await timed_request(
                client,
                "POST",
                "/v1/auth/sessions",
                json={"email": email, "password": password},
            )
            if login.status_code != 200:
                raise RuntimeError(f"login measurement failed with HTTP {login.status_code}.")
            timings["login"].append(login_elapsed * 1_000)
            headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}

            profile_read, profile_read_elapsed = await timed_request(
                client,
                "GET",
                "/v1/users/me",
                headers=headers,
            )
            if profile_read.status_code != 200:
                raise RuntimeError(
                    f"profile-read measurement failed with HTTP {profile_read.status_code}."
                )
            timings["profileRead"].append(profile_read_elapsed * 1_000)

            profile_write, profile_write_elapsed = await timed_request(
                client,
                "PATCH",
                "/v1/users/me",
                headers=headers,
                json={"displayName": f"Timing User {index}"},
            )
            if profile_write.status_code != 200:
                raise RuntimeError(
                    f"profile-write measurement failed with HTTP {profile_write.status_code}."
                )
            timings["profileWrite"].append(profile_write_elapsed * 1_000)

    print(json.dumps(
        {
            metric: {
                "samples": len(values),
                "p95Milliseconds": round(percentile_95(values), 3),
                "meanMilliseconds": round(mean(values), 3),
            }
            for metric, values in timings.items()
        }
    ))


def main() -> None:
    try:
        asyncio.run(measure(parse_arguments()))
    except Exception as error:
        raise SystemExit(f"D2 timing measurement failed: {type(error).__name__}") from error


if __name__ == "__main__":
    main()
