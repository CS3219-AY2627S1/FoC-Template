#!/usr/bin/env bash
# Source from Bash. Selects this repository's AWS config/profile, not ~/.aws
# config or ambient static/container/web-identity credentials. Does not log in.
# First setup: aws configure sso --profile foc-demo
# Later sessions: aws sso login --profile foc-demo
# SSO tokens still use the shared ~/.aws/sso/cache, not .aws-local/.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    printf '%s\n' 'Use: source deploy/aws-env.sh (from the repository root, in Bash).' >&2
    exit 1
fi

_foc_aws_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)" || return 1
if ! (umask 077; mkdir -p -- "${_foc_aws_root}/.aws-local"); then
    unset _foc_aws_root
    return 1
fi
chmod 700 -- "${_foc_aws_root}/.aws-local" || { unset _foc_aws_root; return 1; }

# Environment credentials otherwise take precedence over the named profile.
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN AWS_CREDENTIAL_FILE
unset AWS_DEFAULT_PROFILE AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN AWS_ROLE_SESSION_NAME
unset AWS_CONTAINER_CREDENTIALS_RELATIVE_URI AWS_CONTAINER_CREDENTIALS_FULL_URI
unset AWS_CONTAINER_AUTHORIZATION_TOKEN AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE
# Do not accidentally send AWS requests/credentials to an ambient LocalStack or
# other custom endpoint. Prefix expansion enumerates names, never their values.
for _foc_endpoint_var in ${!AWS_ENDPOINT_URL@}; do
    unset "$_foc_endpoint_var"
done
unset _foc_endpoint_var
# Rely on the selected local profile's configured region, not another shell's.
unset AWS_REGION AWS_DEFAULT_REGION
export AWS_CONFIG_FILE="${_foc_aws_root}/.aws-local/config"
export AWS_SHARED_CREDENTIALS_FILE="${_foc_aws_root}/.aws-local/credentials"
export AWS_PROFILE=foc-demo
export AWS_EC2_METADATA_DISABLED=true
# Botocore otherwise has a legacy fallback to /etc/boto.cfg and ~/.boto.
export BOTO_CONFIG=/dev/null
export AWS_SDK_LOAD_CONFIG=1
unset _foc_aws_root
