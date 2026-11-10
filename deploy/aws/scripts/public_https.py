# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-02
# Scope: Implemented CloudFront request-file generation and public-origin configuration helpers.
# Author review: I validated correctness and added boundary checks where needed.

"""Prepare CloudFront metadata or update its browser origin; never call AWS or rotate secrets."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from pathlib import Path
from uuid import uuid4

from cloud_config import ROOT, read_environment, validate_origin

CACHING_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
ALL_VIEWER = "216adef6-5c7f-47e4-b989-5492eafa07d3"


def distribution_config(origin_domain: str) -> dict:
    # This rollout uses the existing Singapore EC2 public DNS, not an arbitrary
    # host or URL. Recheck the current DNS after stopping/starting the instance.
    if not re.fullmatch(
        r"ec2-(?:\d{1,3}-){3}\d{1,3}\.ap-southeast-1\.compute\.amazonaws\.com", origin_domain
    ):
        raise ValueError(
            "Use the current EC2 Public IPv4 DNS name in Singapore, without a URL or port."
        )
    octets = origin_domain.removeprefix("ec2-").split(".", 1)[0].split("-")
    if any(int(octet) > 255 for octet in octets):
        raise ValueError("Invalid EC2 public DNS address.")
    return {
        "CallerReference": f"foc-public-{uuid4().hex}",
        "Comment": "FoC course demo: EC2 ingress, uncached authenticated requests",
        "Enabled": True,
        "Origins": {
            "Quantity": 1,
            "Items": [
                {
                    "Id": "foc-ec2",
                    "DomainName": origin_domain,
                    "CustomOriginConfig": {
                        "HTTPPort": 8080,
                        "HTTPSPort": 443,
                        "OriginProtocolPolicy": "http-only",
                        "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
                        "OriginReadTimeout": 60,
                        "OriginKeepaliveTimeout": 5,
                    },
                }
            ],
        },
        "DefaultCacheBehavior": {
            "TargetOriginId": "foc-ec2",
            "ViewerProtocolPolicy": "redirect-to-https",
            "AllowedMethods": {
                "Quantity": 7,
                "Items": ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
                "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
            },
            "CachePolicyId": CACHING_DISABLED,
            # AllViewer forwards Authorization, refresh cookies, search/cursor
            # queries, Origin and WebSocket handshake headers without caching.
            "OriginRequestPolicyId": ALL_VIEWER,
            "Compress": True,
            "TrustedSigners": {"Enabled": False, "Quantity": 0},
            "TrustedKeyGroups": {"Enabled": False, "Quantity": 0},
        },
        "CustomErrorResponses": {
            "Quantity": 6,
            "Items": [
                {"ErrorCode": code, "ErrorCachingMinTTL": 0}
                for code in (403, 404, 500, 502, 503, 504)
            ],
        },
        "ViewerCertificate": {"CloudFrontDefaultCertificate": True},
        "Restrictions": {"GeoRestriction": {"RestrictionType": "none", "Quantity": 0}},
        "PriceClass": "PriceClass_200",
        "HttpVersion": "http2",
        "IsIPV6Enabled": True,
    }


def write_distribution(path: Path, origin_domain: str) -> None:
    config = distribution_config(origin_domain)
    # Reusing this file reuses CallerReference, preventing duplicate creation on
    # a retry. Never silently replace an existing distribution request.
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(config, stream, indent=2)
        stream.write("\n")


def validate_public_origin(origin: str) -> str:
    origin = validate_origin(origin)
    if not re.fullmatch(r"https://d[a-z0-9]+\.cloudfront\.net", origin):
        raise ValueError("Use the assigned HTTPS CloudFront hostname without a path or port.")
    return origin


def set_origin(root: Path, origin: str) -> None:
    origin = validate_public_origin(origin)
    path = root / ".env"
    original = path.read_text(encoding="utf-8")
    matches = list(re.finditer(r"(?m)^FOC_PUBLIC_ORIGIN=.*$", original))
    if len(matches) != 1:
        raise ValueError(
            "Expected exactly one existing FOC_PUBLIC_ORIGIN; preserve the environment."
        )
    if read_environment(path).get("FOC_USER_UID") != str(os.getuid()):
        raise ValueError("Run as the session user who generated the existing cloud configuration.")
    replacement = f"FOC_PUBLIC_ORIGIN='{origin}'"
    updated = original[: matches[0].start()] + replacement + original[matches[0].end() :]
    if updated == original:
        return
    # Write atomically with owner-only permissions. Preserve all other entries,
    # keys and database-admin state. No database operation or key generation.
    descriptor, temporary = tempfile.mkstemp(prefix=".origin-", dir=root)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(updated)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("distribution", help="Create a local request file; no AWS call.")
    create.add_argument("--origin-domain", required=True)
    create.add_argument("--output", type=Path, default=ROOT / "cloudfront-request.local.json")
    origin = commands.add_parser("set-origin", help="Update only the existing EC2 browser origin.")
    origin.add_argument("--origin", required=True)
    args = parser.parse_args()
    try:
        if args.command == "distribution":
            write_distribution(args.output, args.origin_domain)
            print(
                "Created local CloudFront request. No AWS resource was created; reuse this file on retries."
            )
        else:
            if os.name != "posix" or os.getuid() == 0:
                raise ValueError(
                    "Update the cloud origin on EC2 as the session user, without sudo."
                )
            set_origin(ROOT, args.origin)
            print(
                "Updated only FOC_PUBLIC_ORIGIN. Recreate Chat API/outbox to apply the new origin."
            )
    except (ValueError, OSError) as error:
        if isinstance(error, ValueError):
            raise SystemExit(str(error)) from None
        raise SystemExit(
            "CloudFront preparation failed; preserve existing files. No secrets were printed."
        ) from None


if __name__ == "__main__":
    main()
