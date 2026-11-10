# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-11-06
# Scope: Implemented generation and validation of scoped delivery policy templates.
# Author review: I validated correctness and added boundary checks where needed.

"""Prepare scoped IAM JSON locally for operator review; never create AWS resources."""

from __future__ import annotations

import argparse
import json
import re

from cloud_config import ROOT
from release_manifest import ARTIFACTS


def policies(account: str, instance: str, distribution: str, subject: str) -> dict:
    if not re.fullmatch(r"[0-9]{12}", account) or not re.fullmatch(r"i-[a-f0-9]{17}", instance):
        raise ValueError("Use the exact AWS account and EC2 instance IDs.")
    if not re.fullmatch(r"[A-Z0-9]{10,20}", distribution):
        raise ValueError("Use the existing CloudFront distribution ID.")
    if not re.fullmatch(
        r"repo:[A-Za-z0-9_.-]+(?:@[0-9]+)?/[A-Za-z0-9_.-]+(?:@[0-9]+)?:ref:refs/heads/main", subject
    ):
        raise ValueError(
            "Use the exact GitHub OIDC main-branch subject, including immutable IDs where enabled."
        )
    repositories = [
        f"arn:aws:ecr:ap-southeast-1:{account}:repository/foc/{name}" for name in ARTIFACTS
    ]

    def policy(statements):
        return {"Version": "2012-10-17", "Statement": statements}

    auth = {"Effect": "Allow", "Action": ["ecr:GetAuthorizationToken"], "Resource": "*"}
    pull = {
        "Effect": "Allow",
        "Action": [
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage",
        ],
        "Resource": repositories,
    }
    document = f"arn:aws:ssm:ap-southeast-1:{account}:document/FoC-DeployRelease"
    return {
        "trust": policy(
            [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "Federated": f"arn:aws:iam::{account}:oidc-provider/token.actions.githubusercontent.com"
                    },
                    "Action": "sts:AssumeRoleWithWebIdentity",
                    "Condition": {
                        "StringEquals": {
                            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                            "token.actions.githubusercontent.com:sub": subject,
                        }
                    },
                }
            ]
        ),
        "publish": policy(
            [
                auth,
                {
                    "Effect": "Allow",
                    "Action": [
                        "ecr:BatchCheckLayerAvailability",
                        "ecr:InitiateLayerUpload",
                        "ecr:UploadLayerPart",
                        "ecr:CompleteLayerUpload",
                        "ecr:PutImage",
                        "ecr:DescribeImages",
                        "ecr:BatchGetImage",
                        "ecr:GetDownloadUrlForLayer",
                    ],
                    "Resource": repositories,
                },
            ]
        ),
        "pull": policy([auth, pull]),
        "deploy": policy(
            [
                {
                    "Effect": "Allow",
                    "Action": "ssm:SendCommand",
                    "Resource": [
                        document,
                        f"arn:aws:ec2:ap-southeast-1:{account}:instance/{instance}",
                    ],
                },
                {"Effect": "Allow", "Action": "ssm:GetDocument", "Resource": document},
                {
                    "Effect": "Allow",
                    "Action": [
                        "ssm:GetCommandInvocation",
                        "ssm:DescribeInstanceInformation",
                        "ec2:DescribeInstances",
                    ],
                    "Resource": "*",
                    "Condition": {"StringEquals": {"aws:RequestedRegion": "ap-southeast-1"}},
                },
                {
                    "Effect": "Allow",
                    "Action": "cloudfront:GetDistributionConfig",
                    "Resource": f"arn:aws:cloudfront::{account}:distribution/{distribution}",
                },
            ]
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--cloudfront-id", required=True)
    parser.add_argument("--oidc-subject", required=True)
    args = parser.parse_args()
    try:
        values = policies(args.account_id, args.instance_id, args.cloudfront_id, args.oidc_subject)
        paths = {name: ROOT / f"delivery-{name}.local.json" for name in values}
        if any(path.exists() for path in paths.values()):
            raise ValueError(
                "Delivery JSON already exists. Review/reuse it; do not overwrite operator changes."
            )
        for name, value in values.items():
            with paths[name].open("x", encoding="utf-8") as stream:
                json.dump(value, stream, indent=2)
                stream.write("\n")
        print(
            "Prepared ignored delivery-trust/publish/deploy/pull.local.json files. No AWS request was made."
        )
    except (OSError, ValueError) as error:
        raise SystemExit(
            str(error)
            if isinstance(error, ValueError)
            else "Could not prepare local delivery files."
        ) from None


if __name__ == "__main__":
    main()
