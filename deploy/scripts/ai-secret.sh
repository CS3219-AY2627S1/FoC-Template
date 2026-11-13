#!/usr/bin/env bash
# Shared AWS/Floci secret checks. Caller supplies ai_aws and AI_SECRET_ID.
ai_secret_valid() {
  node -e '
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => data += chunk);
    process.stdin.on("end", () => {
      try {
        const value = JSON.parse(data);
        const keys = ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_ENDPOINT"];
        process.exit(keys.every(k => typeof value[k] === "string" &&
          value[k].trim() && !/^(REPLACE_ME|PLACEHOLDER|YOUR[_ -])/i.test(value[k].trim())) ? 0 : 1);
      } catch { process.exit(1); }
    });
  '
}
ai_env_valid() {
  node -e '
    const keys = ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_ENDPOINT"];
    process.exit(keys.every(k => typeof process.env[k] === "string" &&
      process.env[k].trim() && !/^(REPLACE_ME|PLACEHOLDER|YOUR[_ -])/i.test(process.env[k].trim())) ? 0 : 1);
  '
}
ai_secret_preflight() {
  local mode="$1" error_file value
  AI_SECRET_INITIALIZED=0
  AI_SECRET_EXISTS=0
  error_file="$(mktemp)"
  if value="$(ai_aws secretsmanager get-secret-value --secret-id "$AI_SECRET_ID" --query SecretString --output text 2>"$error_file")"; then
    AI_SECRET_EXISTS=1
    if printf '%s' "$value" | ai_secret_valid; then AI_SECRET_INITIALIZED=1; fi
  elif ! grep -q 'ResourceNotFoundException' "$error_file"; then
    echo "Unable to read AI configuration secret; check AWS credentials and permissions:" >&2
    cat "$error_file" >&2
    rm -f "$error_file"
    return 1
  fi
  rm -f "$error_file"
  if (( ! AI_SECRET_INITIALIZED )) && ! ai_env_valid; then
    if [[ "$mode" == strict ]]; then
      echo 'AI secret is missing or uninitialized. Set AI_PROVIDER, AI_API_KEY, AI_MODEL and AI_ENDPOINT in deploy/relay.aws.env before deployment.' >&2
      return 1
    fi
    if [[ "$mode" == warn ]]; then
      echo 'Warning: AI provider values are missing; credit estimation will not function.' >&2
    fi
  fi
}
ai_secret_initialize() {
  if (( ! AI_SECRET_INITIALIZED )) && ai_env_valid; then
    node -e 'const keys = ["AI_PROVIDER","AI_API_KEY","AI_MODEL","AI_ENDPOINT"]; process.stdout.write(JSON.stringify(Object.fromEntries(keys.map(k => [k, process.env[k]]))))' |
      ai_aws secretsmanager put-secret-value --secret-id "$AI_SECRET_ID" --secret-string file:///dev/stdin >/dev/null
    AI_SECRET_INITIALIZED=1
  fi
}
ai_secret_export_values() {
  local value
  AI_PROVIDER='' AI_API_KEY='' AI_MODEL='' AI_ENDPOINT=''
  if (( AI_SECRET_INITIALIZED )); then
    value="$(ai_aws secretsmanager get-secret-value --secret-id "$AI_SECRET_ID" --query SecretString --output text)"
    printf '%s' "$value" | ai_secret_valid || { echo 'AI configuration secret is invalid.' >&2; return 1; }
    AI_PROVIDER="$(printf '%s' "$value" | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>process.stdout.write(JSON.parse(s).AI_PROVIDER))')"
    AI_API_KEY="$(printf '%s' "$value" | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>process.stdout.write(JSON.parse(s).AI_API_KEY))')"
    AI_MODEL="$(printf '%s' "$value" | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>process.stdout.write(JSON.parse(s).AI_MODEL))')"
    AI_ENDPOINT="$(printf '%s' "$value" | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>process.stdout.write(JSON.parse(s).AI_ENDPOINT))')"
  fi
}
