"""Isolated Compose acceptance: real Admin/User/PostgreSQL/authenticated Kafka.

Creates a unique disposable project, never uses .env or an existing database/broker.
Seeds TEST-ONLY case data and activates a disposable User account via fixture SQL
inside this project's databases (not a reporting, email verification or bootstrap test).
Credit outcomes are simulated by a test producer using Credit's broker principal;
no Credit application or ledger runs. User bans/outcomes are produced by real User.
Chat evidence is served by an explicit private test fixture, never a production fallback.
Never run the simulated Credit producer against a shared stack.
ADMIN_RUNTIME_CASE_EVENTS_ONLY=true omits User/Gateway and verifies four TEST-ONLY stored
history envelopes through packaged Admin, real PostgreSQL and authenticated Kafka, then restart.
"""

import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]


def run(args, *, env=None, data=None, timeout=600):
    result = subprocess.run(args, cwd=ROOT, env=env, input=data, text=True,
                            capture_output=True, timeout=timeout, encoding="utf-8")
    if result.returncode:
        # Never print command input/environment: they may contain throwaway keys/tokens.
        raise RuntimeError(f"{args[0]} failed ({result.returncode}): {result.stderr[-3000:]}")
    return result.stdout.strip()


def check_case_events(compose, sql, broker, poll):
    """TEST ONLY stored history; real packaged producer, database and SASL broker."""
    case, actor, participant, order = (str(uuid.uuid4()) for _ in range(4))
    sql(f"INSERT INTO admin_cases(id,order_id,state,reviewer_id,revision,source_sequence,correlation_id) VALUES ('{case}','{order}','UNDER_REVIEW','{actor}',4,4,'{case}')")
    originals = []
    for sequence, event_type in enumerate(("CaseOpened", "CaseClaimed", "CaseActionCompleted", "CaseResolved"), 1):
        event_id, owner_id = str(uuid.uuid4()), str(uuid.uuid4())
        occurred = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        data = dict(caseId=case, orderId=order, sourceSequence=sequence)
        if event_type == "CaseOpened":
            data["reporterId"] = participant
        elif event_type == "CaseActionCompleted":
            data.update(operationId=str(uuid.uuid4()), ownerEventId=owner_id, targetUserId=participant, result="REJECTED")
        else:
            data["reviewerId"] = actor
        if event_type == "CaseResolved":
            data["resolvedAt"] = occurred
        fact = dict(eventId=event_id, eventType=event_type, eventVersion=1, aggregateType="AdminCase",
                    aggregateId=case, aggregateVersion=sequence, occurredAt=occurred, producer="admin-service",
                    correlationId=case, causationId=owner_id if event_type == "CaseActionCompleted" else None,
                    actor=dict(type="USER", userId=participant if sequence == 1 else actor,
                               role="REQUESTER" if sequence == 1 else "ADMIN"), data=data)
        original = json.dumps(fact, separators=(",", ":")); originals.append(original)
        sql(f"INSERT INTO admin_case_outbox(event_id,case_id,source_sequence,event_type,topic,payload,created_at) VALUES ('{event_id}','{case}',{sequence},'{event_type}','admin.events','{original}',CURRENT_TIMESTAMP)")
    poll(lambda: sql(f"SELECT count(*) FROM admin_case_outbox WHERE case_id='{case}' AND published_at IS NOT NULL") == "4", seconds=120)
    committed = broker('source /opt/foc-kafka/lib.sh; f=$(mktemp); trap \'rm -f "$f"\' EXIT; '
        'write_client_properties "$f" kafka_ui "$KAFKA_UI_BROKER_PASSWORD"; '
        'kafka_command kafka-console-consumer.sh --bootstrap-server localhost:9092 --command-config "$f" '
        '--topic admin.events --group kafka-ui-browser-lifecycle-test --from-beginning '
        '--isolation-level read_committed --timeout-ms 30000 --max-messages 4 '
        '--property print.key=true --property key.separator="|"')
    records = [line.split("|", 1) for line in committed.splitlines() if line.startswith(case + "|")]
    assert records == [[case, original] for original in originals], "Committed lifecycle identity/content/order mismatch"
    marks = sql(f"SELECT event_id,published_at,attempts FROM admin_case_outbox WHERE case_id='{case}' ORDER BY source_sequence")
    compose("restart", "admin-service")
    compose("up", "-d", "--no-deps", "--wait", "admin-service", timeout=180)
    assert marks == sql(f"SELECT event_id,published_at,attempts FROM admin_case_outbox WHERE case_id='{case}' ORDER BY source_sequence")
    print("PASS: packaged Admin, real PostgreSQL, REAL SASL transactional delivery of all four types, original IDs/content/order and durable progress after Admin restart", flush=True)
    print("TEST ONLY: stored history fixture. NOT VERIFIED: User/Gateway journey, Chat ingestion or owner-service effects", flush=True)


def main():
    case_events_only = os.environ.get("ADMIN_RUNTIME_CASE_EVENTS_ONLY") == "true"
    openssl = shutil.which("openssl")
    if not openssl and os.name == "nt":
        candidate = Path("C:/Program Files/Git/usr/bin/openssl.exe")
        openssl = str(candidate) if candidate.exists() else None
    if not openssl:
        raise RuntimeError("Install OpenSSL to generate disposable signing keys")
    project = "foc-admin-runtime-test-" + uuid.uuid4().hex[:10]
    env = os.environ.copy()
    for service in ("USER", "SUPPLIER", "CREDIT", "ORDER", "NOTIFICATION"):
        env.update({f"{service}_DB_NAME": service.lower() + "_test",
                    f"{service}_DB_USER": service.lower() + "_test",
                    f"{service}_DB_PASSWORD": secrets.token_hex(24)})
    for principal in ("ADMIN", "BROKER", "USER_SERVICE", "ORDER_SERVICE", "CREDIT_SERVICE",
                      "NOTIFICATION_SERVICE", "ADMIN_SERVICE", "UI_BROKER", "UI_LOGIN"):
        env[f"KAFKA_{principal}_PASSWORD"] = secrets.token_hex(24)
    email, password = "runtime-test@u.nus.edu", "Test!" + secrets.token_hex(16)
    env.update(ADMIN_DB_NAME="admin_runtime_test", ADMIN_DB_USER="admin_runtime_user",
               ADMIN_DB_PASSWORD=secrets.token_hex(24), KAFKA_UI_LOGIN_USERNAME="test-viewer",
               ADMIN_BOOTSTRAP_EMAIL="", ADMIN_BOOTSTRAP_USERNAME="",
               ADMIN_BOOTSTRAP_PASSWORD="", MAIL_PROVIDER="noop",
               ADMIN_SERVICE_KEY_ID="admin-runtime-test", ADMIN_SERVICE_TRUSTED_KEYS="{}", USER_ADMIN_COMMANDS_ENABLED="true")
    with tempfile.TemporaryDirectory(prefix=project) as directory:
        directory = Path(directory)
        for name in ("user", "admin"):
            pem, der, public = (directory / (name + suffix) for suffix in (".pem", ".der", ".pub"))
            run([openssl, "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(pem)])
            run([openssl, "pkcs8", "-topk8", "-nocrypt", "-in", str(pem), "-outform", "DER", "-out", str(der)])
            env["JWT_PRIVATE_KEY" if name == "user" else "ADMIN_SERVICE_PRIVATE_KEY"] = base64.b64encode(der.read_bytes()).decode()
            if name == "admin":
                run([openssl, "pkey", "-in", str(pem), "-pubout", "-outform", "DER", "-out", str(public)])
                env["USER_SERVICE_TRUSTED_KEYS"] = json.dumps({"admin-runtime-test": {
                    "subject": "admin-service", "publicKey": base64.b64encode(public.read_bytes()).decode()}})
        # Random published ports; no collisions and no normal stack dependencies.
        override = directory / "override.yaml"
        scripts = directory / "kafka-scripts"
        shutil.copytree(ROOT / "deploy/kafka", scripts, ignore=shutil.ignore_patterns("k8s"))
        override.write_text("""services:
  admin-db:
    ports: !override []
  user-db:
    ports: !override []
  user-service:
    ports: !override []
  kafka:
    ports: !override []
    healthcheck:
      timeout: 30s
      retries: 30
    volumes: !override
      - KAFKA_SCRIPTS:/opt/foc-kafka:ro
      - kafka-data:/var/lib/kafka
  kafka-init:
    environment:
      JAVA_TOOL_OPTIONS: -XX:ActiveProcessorCount=2 -XX:TieredStopAtLevel=1
    volumes: !override
      - KAFKA_SCRIPTS:/opt/foc-kafka:ro
  admin-service:
    ports: !override ["127.0.0.1::8084"]
    environment:
      ADMIN_ACTION_OUTCOME_TIMEOUT_SECONDS: 3
      ADMIN_KAFKA_RECONCILE_SECONDS: 10
    healthcheck:
      timeout: 10s
      retries: 20
  gateway:
    ports: !override ["127.0.0.1::8088"]
""".replace("KAFKA_SCRIPTS", scripts.as_posix()), encoding="utf-8")
        if case_events_only:
            # This transport-only mode needs no User application, account or gateway.
            override.write_text(override.read_text(encoding="utf-8").replace("  admin-service:\n", """  admin-service:
    depends_on: !override
      admin-db:
        condition: service_healthy
      kafka-init:
        condition: service_completed_successfully
"""), encoding="utf-8")
        empty = directory / "empty.env"
        empty.touch()
        evidence_directory = directory / "evidence"
        evidence_directory.mkdir()
        if not case_events_only:
            # This fixture is isolated from the normal Compose stack and has no host port.
            fixture_script = ROOT / "admin-service/scripts/runtime_evidence_fixture.py"
            with override.open("a", encoding="utf-8") as stream:
                stream.write("""  admin-evidence-fixture:
    image: python:3.13-alpine
    command: ["python3", "/fixture.py", "/evidence"]
    volumes:
      - type: bind
        source: FIXTURE_SCRIPT
        target: /fixture.py
        read_only: true
      - type: bind
        source: FIXTURE_DATA
        target: /evidence
        read_only: true
    networks: [admin-evidence-fixture]
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8090/health')"]
      interval: 2s
      timeout: 3s
      retries: 15
networks:
  admin-evidence-fixture:
    internal: true
""".replace("FIXTURE_SCRIPT", json.dumps(fixture_script.as_posix()))
       .replace("FIXTURE_DATA", json.dumps(evidence_directory.as_posix())))
            content = override.read_text(encoding="utf-8")
            content = content.replace("      ADMIN_ACTION_OUTCOME_TIMEOUT_SECONDS: 3",
                "      ADMIN_CHAT_URL: http://admin-evidence-fixture:8090\n      ADMIN_ACTION_OUTCOME_TIMEOUT_SECONDS: 3")
            content = content.replace("  admin-service:\n    ports:",
                "  admin-service:\n    networks: [default, admin-data, admin-evidence-fixture]\n    ports:")
            override.write_text(content, encoding="utf-8")
        prefix = ["docker", "compose", "--project-directory", str(ROOT), "--env-file", str(empty),
                  "-p", project, "-f", str(ROOT / "compose.yaml"), "-f", str(override)]

        def compose(*args, data=None, timeout=600):
            return run(prefix + list(args), env=env, data=data, timeout=timeout)

        def sql(query):
            return compose("exec", "-T", "admin-db", "psql", "-U", env["ADMIN_DB_USER"], "-d", env["ADMIN_DB_NAME"],
                           "-v", "ON_ERROR_STOP=1", "-At", data=query)

        def broker(script, data=None):
            return compose("exec", "-T", "kafka", "bash", "-c", script, data=data, timeout=60)

        def poll(check, seconds=60):
            until = time.monotonic() + seconds
            while time.monotonic() < until:
                value = check()
                if value:
                    return value
                time.sleep(1)
            raise AssertionError("Runtime check timed out")

        try:
            compose("config", "--quiet")
            print("Building isolated Admin image" if case_events_only else "Building isolated Admin, User and gateway images", flush=True)
            compose("build", *( ["admin-service"] if case_events_only else ["admin-service", "user-service", "gateway"] ), timeout=1200)
            if not case_events_only:
                compose("up", "-d", "--wait", "admin-evidence-fixture", timeout=180)
            print("Starting private Admin database, authenticated broker and Admin" if case_events_only else "Starting private databases, User, authenticated broker and Admin", flush=True)
            compose("up", "-d", "--wait", "admin-service", timeout=1200)
            if case_events_only:
                check_case_events(compose, sql, broker, poll)
                return
            compose("up", "-d", "--no-deps", "gateway")
            address = compose("port", "gateway", "8088").splitlines()[0]
            base = "http://" + address

            def http(path, method="GET", body=None, token=None, key=None):
                headers = {"Content-Type": "application/json"}
                if token:
                    headers["Authorization"] = "Bearer " + token
                if key:
                    headers["Idempotency-Key"] = key
                request = urllib.request.Request(base + path, method=method, headers=headers,
                    data=None if body is None else json.dumps(body).encode())
                try:
                    with urllib.request.urlopen(request, timeout=10) as response:
                        return response.status, response.read().decode()
                except urllib.error.HTTPError as error:
                    return error.code, error.read().decode()

            def healthy():
                try:
                    return http("/actuator/health")[0] == 200
                except OSError:
                    return False

            poll(healthy)
            assert http("/admin")[0] == 200
            assert http("/api/admin/session")[0] == 401
            assert http("/internal/admin/cases/test/access")[0] == 404
            assert http("/internal/users/test/admin-eligibility")[0] == 404
            status, _ = http("/api/users/registrations", "POST", {
                "email": email, "username": "runtime-test", "password": password})
            assert status in (201, 503), "Disposable User registration failed"
            # No email is sent. User persists an unverified registration when mail is unavailable.
            # Fixture activation/promotion is confined to this newly created test database.
            compose("exec", "-T", "user-db", "psql", "-U", env["USER_DB_USER"], "-d", env["USER_DB_NAME"],
                    "-v", "ON_ERROR_STOP=1", data=f"""UPDATE users SET status='ACTIVE' WHERE email='{email}';
INSERT INTO user_roles(user_id,role) SELECT id,'ADMIN' FROM users WHERE email='{email}';""")
            status, body = http("/api/users/login", "POST", {"email": email, "password": password})
            assert status == 200, "Real User login failed"
            login = json.loads(body)
            status, body = http("/api/users/me/session-role", "PATCH", {"role": "ADMIN"}, login["accessToken"])
            assert status == 200, "Real User Admin mode selection failed"
            token = json.loads(body)["accessToken"]
            assert http("/api/admin/session", token=token)[0] == 200, "User JWKS/current eligibility trust failed"
            print("PASS: gateway UI, private routes, real User JWT and current Admin eligibility", flush=True)
            actor, case, order, target = login["userId"], str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
            sql(f"""INSERT INTO admin_cases(id,order_id,state,reviewer_id,revision,source_sequence,correlation_id) VALUES ('{case}','{order}','UNDER_REVIEW','{actor}',2,2,'{case}');
INSERT INTO admin_case_participants(case_id,user_id) VALUES ('{case}','{target}');
INSERT INTO admin_statements(case_id,reporter_id,description,submitted_at,eligibility_revision)
VALUES ('{case}','{target}','TEST ONLY runtime transport',CURRENT_TIMESTAMP,'TEST-ONLY');""")
            # Explicit TEST-ONLY stored history, never a Chat/live reporting fallback.
            for sequence, event_type, event_actor, role, field in (
                (1, "CaseOpened", target, "REQUESTER", "reporterId"),
                (2, "CaseClaimed", actor, "ADMIN", "reviewerId"),
            ):
                event_id = str(uuid.uuid4())
                occurred = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                fact = dict(eventId=event_id, eventType=event_type, eventVersion=1,
                            aggregateType="AdminCase", aggregateId=case, aggregateVersion=sequence,
                            occurredAt=occurred, producer="admin-service", correlationId=case,
                            causationId=None, actor=dict(type="USER", userId=event_actor, role=role),
                            data=dict(caseId=case, orderId=order, sourceSequence=sequence, **{field: event_actor}))
                original = json.dumps(fact, separators=(",", ":")).replace("'", "''")
                sql(f"INSERT INTO admin_case_outbox(event_id,case_id,source_sequence,event_type,topic,payload,created_at) VALUES ('{event_id}','{case}',{sequence},'{event_type}','admin.events','{original}',CURRENT_TIMESTAMP)")
            key = str(uuid.uuid4())
            path = f"/api/admin/cases/{case}/actions"
            body = {"type": "CREDIT_ADJUSTMENT", "targetUserId": target, "amount": -5,
                    "reason": "TEST ONLY runtime transport; no financial effect"}
            status, problem = http(path, "POST", body, token, str(uuid.uuid4()))
            assert status == 503, f"Missing evidence did not fail closed: {status}: {problem[:1000]}"
            assert sql(f"SELECT count(*) FROM admin_actions WHERE case_id='{case}'") == "0"
            evidence_file = evidence_directory / (case + ".json")
            evidence = dict(orderId=order, requesterId=target, coverage="INCOMPLETE")
            evidence_file.write_text(json.dumps(evidence), encoding="utf-8")
            assert http(path, "POST", body, token, str(uuid.uuid4()))[0] == 503, "Incomplete evidence did not fail closed"
            evidence["coverage"] = "COMPLETE"
            evidence_file.write_text(json.dumps(evidence), encoding="utf-8")
            status, receipt = http(path, "POST", body, token, key)
            assert status == 202, f"Admin action was not durably accepted: {status}: {receipt[:1000]}"
            print("PASS: missing/incomplete TEST-ONLY Chat evidence fails closed; unrelated reviewer accepted with complete fixture evidence", flush=True)
            operation = json.loads(receipt)["operationId"]
            poll(lambda: sql(f"SELECT published_at IS NOT NULL FROM admin_action_outbox WHERE operation_id='{operation}'") == "t")
            # Read the actual broker command as Credit, not directly from Admin's outbox.
            broker('source /opt/foc-kafka/lib.sh; write_client_properties /tmp/runtime-credit.properties credit_service "$KAFKA_CREDIT_SERVICE_PASSWORD"')
            observed = broker('timeout 40 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 '
                '--command-config /tmp/runtime-credit.properties --topic admin.credit.commands '
                '--group credit-service-admin --from-beginning --max-messages 1')
            try:
                command = json.loads(observed)
            except json.JSONDecodeError as error:
                raise AssertionError("Test broker observer did not return command JSON: " + observed[:500]) from error
            assert command["data"]["operationId"] == operation
            poll(lambda: json.loads(http(path + "/" + operation, token=token)[1])["status"] == "UNKNOWN")
            assert http(path, "POST", body, token, key) == (202, receipt), "Original receipt changed on retry"
            poll(lambda: int(sql(f"SELECT attempts FROM admin_action_outbox WHERE operation_id='{operation}'")) >= 2)
            original = json.loads(sql(f"SELECT payload FROM admin_action_outbox WHERE operation_id='{operation}'"))
            assert original == command, "Retry changed the command identity"
            print("PASS: authenticated command delivery, UNKNOWN and original retry identity", flush=True)
            outcome = dict(command)
            outcome.update(eventId=str(uuid.uuid4()), eventType="AdminCreditCorrectionRejected",
                           producer="credit-service", causationId=command["eventId"],
                           occurredAt=datetime.now(timezone.utc).isoformat())
            outcome["data"] = {name: command["data"][name] for name in
                               ("operationId", "caseId", "orderId", "targetUserId", "requestedBy", "amount")}
            outcome["data"].update(result="REJECTED", reasonCode="INSUFFICIENT_AVAILABLE_CREDITS",
                                    completedAt=outcome["occurredAt"])
            wire = target + "|" + json.dumps(outcome, separators=(",", ":")) + "\n"
            # TEST PRODUCER ONLY: does not verify Credit balance arithmetic or reserved credits.
            broker('/opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 '
                   '--command-config /tmp/runtime-credit.properties --topic credit.admin.events --sync '
                   '--reader-property parse.key=true --reader-property key.separator="|" '
                   '--command-property enable.idempotence=true --command-property acks=all', data=wire * 2)
            poll(lambda: json.loads(http(path + "/" + operation, token=token)[1])["status"] == "REJECTED")
            assert sql("SELECT count(*) FROM admin_action_inbox") == "1", "Duplicate outcome applied twice"
            assert sql("SELECT count(*) FROM admin_case_outbox WHERE event_type='CaseActionCompleted'") == "1"
            print("PASS: TEST-ONLY rejected outcomes consumed once despite duplicate delivery", flush=True)
            poll(lambda: sql(f"SELECT count(*) FROM admin_case_outbox WHERE case_id='{case}' AND published_at IS NOT NULL") == "3")
            broker('source /opt/foc-kafka/lib.sh; write_client_properties /tmp/runtime-viewer.properties kafka_ui "$KAFKA_UI_BROKER_PASSWORD"')
            committed = broker('timeout 40 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 '
                '--command-config /tmp/runtime-viewer.properties --topic admin.events '
                '--group kafka-ui-browser-lifecycle-test --from-beginning --isolation-level read_committed '
                '--max-messages 3 --property print.key=true --property key.separator="|"')
            records = [line.split("|", 1) for line in committed.splitlines() if line.startswith(case + "|")]
            assert len(records) == 3, "Missing committed lifecycle history"
            for sequence, (record_key, original) in enumerate(records, 1):
                assert record_key == case
                assert json.loads(original)["data"]["sourceSequence"] == sequence
                assert original == sql(f"SELECT payload FROM admin_case_outbox WHERE case_id='{case}' AND source_sequence={sequence}"), "Lifecycle identity/payload changed"
            print("PASS: REAL SASL lifecycle transactions and original stored history in case order; history fixture and Credit result are TEST ONLY", flush=True)
            delivery_marks = sql(f"SELECT event_id,published_at,attempts FROM admin_case_outbox WHERE case_id='{case}' AND source_sequence<=3 ORDER BY source_sequence")

            # Real User sanctions: its consumer is temporarily disabled while its auth API stays up.
            def user_sql(query):
                return compose("exec", "-T", "user-db", "psql", "-U", env["USER_DB_USER"], "-d", env["USER_DB_NAME"],
                               "-v", "ON_ERROR_STOP=1", "-qAt", data=query)

            target_email = "sanction-target@u.nus.edu"
            assert http("/api/users/registrations", "POST", {"email":target_email,"username":"sanction-target","password":password})[0] in (201,503)
            sanction_target = user_sql(f"UPDATE users SET status='ACTIVE' WHERE email='{target_email}'; SELECT id FROM users WHERE email='{target_email}';").splitlines()[-1]
            for participant in (sanction_target,):
                sql(f"INSERT INTO admin_case_participants(case_id,user_id) VALUES ('{case}','{participant}'); INSERT INTO admin_statements(case_id,reporter_id,description,submitted_at,eligibility_revision) VALUES ('{case}','{participant}','TEST ONLY sanctions',CURRENT_TIMESTAMP,'TEST-ONLY');")
            evidence["historicalCourierIds"] = [sanction_target]
            evidence_file.write_text(json.dumps(evidence), encoding="utf-8")
            exercise_outage=os.environ.get("ADMIN_RUNTIME_CONSUMER_OUTAGE","true")=="true"
            if exercise_outage:
                env["USER_ADMIN_COMMANDS_ENABLED"] = "false"
                compose("up", "-d", "--no-deps", "--wait", "user-service", timeout=240)
                poll(lambda:http("/api/users/me",token=token)[0]==200)
            else:
                print("Consumer-outage phase skipped for focused HTTP/replay rerun; not a new outage-test pass",flush=True)
            ban_body={"type":"BAN","targetUserId":sanction_target,"reason":"TEST ONLY account safety review"}
            ban_key=str(uuid.uuid4())
            status,ban_receipt=http(path,"POST",ban_body,token,ban_key)
            assert status==202, "Ban was not accepted while User auth was available"
            ban_op=json.loads(ban_receipt)["operationId"]
            if exercise_outage:
                poll(lambda:json.loads(http(path+"/"+ban_op,token=token)[1])["status"]=="UNKNOWN")
            assert http(path,"POST",ban_body,token,ban_key)==(202,ban_receipt)
            original_ban=sql(f"SELECT payload FROM admin_action_outbox WHERE operation_id='{ban_op}'")
            if exercise_outage:
                env["USER_ADMIN_COMMANDS_ENABLED"] = "true"
                compose("up", "-d", "--no-deps", "--wait", "user-service", timeout=240)
                poll(lambda:http("/api/users/me",token=token)[0]==200)
            poll(lambda:json.loads(http(path+"/"+ban_op,token=token)[1])["status"]=="SUCCEEDED")
            assert original_ban==sql(f"SELECT payload FROM admin_action_outbox WHERE operation_id='{ban_op}'")
            account=json.loads(http("/api/users/admin/accounts?query="+target_email,token=token)[1])["content"][0]
            assert account["status"]=="BANNED"
            owner_outcome=json.loads(user_sql(f"SELECT payload FROM user_sanction_operations WHERE operation_id='{ban_op}'"))
            assert owner_outcome["producer"]=="user-service" and owner_outcome["data"]["result"]=="APPLIED"
            samples=ROOT/"admin-service"/"target"/"ban-contract-samples"
            samples.mkdir(parents=True,exist_ok=True)
            (samples/"command.json").write_text(original_ban,encoding="utf-8")
            (samples/"applied.json").write_text(json.dumps(owner_outcome),encoding="utf-8")
            status,noop=http(path,"POST",ban_body,token,str(uuid.uuid4()))
            assert status==202
            noop_op=json.loads(noop)["operationId"]
            poll(lambda:json.loads(http(path+"/"+noop_op,token=token)[1])["status"]=="SUCCEEDED")
            noop_outcome=json.loads(user_sql(f"SELECT payload FROM user_sanction_operations WHERE operation_id='{noop_op}'"))
            assert noop_outcome["data"]["result"]=="NO_CHANGE"
            (samples/"no-change.json").write_text(json.dumps(noop_outcome),encoding="utf-8")
            status,problem=http("/api/users/admin/accounts/"+sanction_target+"/status","PATCH",{"status":"ACTIVE"},token)
            assert status==400, f"Missing reactivation reason returned {status}: {problem[:1000]}"
            assert http("/api/users/admin/accounts/"+sanction_target+"/status","PATCH",{"status":"ACTIVE","reason":"TEST ONLY appeal reviewed"},token)[0]==200
            generation=int(user_sql(f"SELECT dispatch_version FROM user_sanction_outbox WHERE operation_id='{ban_op}'"))
            broker('source /opt/foc-kafka/lib.sh; write_client_properties /tmp/runtime-admin-service.properties admin_service "$KAFKA_ADMIN_SERVICE_PASSWORD"')
            broker('/opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 '
                   '--command-config /tmp/runtime-admin-service.properties --topic admin.user.commands --sync '
                   '--reader-property parse.key=true --reader-property key.separator="|" '
                   '--command-property enable.idempotence=true --command-property acks=all',data=sanction_target+"|"+original_ban+"\n")
            poll(lambda:int(user_sql(f"SELECT dispatch_version FROM user_sanction_outbox WHERE operation_id='{ban_op}'"))>generation)
            assert json.loads(http("/api/users/admin/accounts?query="+target_email,token=token)[1])["content"][0]["status"]=="ACTIVE", "Old operation rebanned reactivated account"
            assert json.loads(user_sql(f"SELECT payload FROM user_sanction_operations WHERE operation_id='{ban_op}'"))==owner_outcome
            # User's defense-in-depth is exercised by a TEST-ONLY broker producer. A legitimate
            # independent reviewer cannot also be an involved target of their own case.
            self_command = json.loads(original_ban)
            self_op = str(uuid.uuid4())
            self_command.update(eventId=str(uuid.uuid4()), aggregateId=actor,
                                occurredAt=datetime.now(timezone.utc).isoformat())
            self_command["data"].update(operationId=self_op, targetUserId=actor,
                                        reason="TEST ONLY direct command for User self protection")
            broker('/opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 '
                   '--command-config /tmp/runtime-admin-service.properties --topic admin.user.commands --sync '
                   '--reader-property parse.key=true --reader-property key.separator="|" '
                   '--command-property enable.idempotence=true --command-property acks=all',
                   data=actor+"|"+json.dumps(self_command,separators=(",",":"))+"\n")
            self_outcome = json.loads(poll(lambda:user_sql(f"SELECT payload FROM user_sanction_operations WHERE operation_id='{self_op}'")))
            assert self_outcome["data"]["result"] == "REJECTED"
            assert self_outcome["data"]["reasonCode"] == "SELF_SANCTION_FORBIDDEN"
            (samples/"rejected.json").write_text(json.dumps(self_outcome),encoding="utf-8")
            assert user_sql(f"SELECT count(*) FROM user_account_audit WHERE operation_id='{ban_op}'")=="1"
            print("PASS: REAL User Kafka ban/recovery, NO_CHANGE, TEST-ONLY direct-command self-ban protection, reason/audit reactivation and duplicate-after-reactivation",flush=True)
            # Optional bounded visual review in this disposable environment, never a live fallback.
            if os.environ.get("ADMIN_RUNTIME_UI_REVIEW")=="true":
                review_file=ROOT/"output"/"sanctions-ui-review.json"
                done_file=ROOT/"output"/"sanctions-ui-review.done"
                done_file.unlink(missing_ok=True)
                review_file.write_text(json.dumps({"testOnly":True,"base":base,"caseId":case,"email":email,"password":password}),encoding="utf-8")
                print("Disposable GUI ready; waiting up to 5 minutes for visual review",flush=True)
                until=time.monotonic()+300
                while not done_file.exists() and time.monotonic()<until: time.sleep(1)
                review_file.unlink(missing_ok=True);done_file.unlink(missing_ok=True)
            compose("restart", "admin-service")
            compose("up", "-d", "--no-deps", "--wait", "admin-service", timeout=180)
            assert delivery_marks == sql(f"SELECT event_id,published_at,attempts FROM admin_case_outbox WHERE case_id='{case}' AND source_sequence<=3 ORDER BY source_sequence")
            assert json.loads(http(path + "/" + operation, token=token)[1])["status"] == "REJECTED"
            # Exercise failure without ever changing the normal User Service.
            status, login_body=http("/api/users/login","POST",{"email":email,"password":password})
            assert status==200
            status, role_body=http("/api/users/me/session-role","PATCH",{"role":"ADMIN"},json.loads(login_body)["accessToken"])
            assert status==200
            token=json.loads(role_body)["accessToken"]
            compose("stop", "user-service")
            assert http("/api/admin/session", token=token)[0] == 503
            print("PASS: packaged UI/auth, real User eligibility, private callbacks, authenticated command delivery, "
                  "UNKNOWN/retry identity, TEST-ONLY duplicate rejected outcomes, restart persistence, User outage.")
            print("NOT VERIFIED: real Credit consumer, financial effect, insufficient funds or reserved-balance arithmetic.")
        except Exception:
            # Admin logs contain startup/transport metadata; never dump User/mail logs or env.
            print(compose("logs", "--no-color", "--tail=50", "admin-service"), flush=True)
            raise
        finally:
            # Only this UUID-named project, created by this invocation. Never touch shared volumes.
            compose("down", "--volumes", "--remove-orphans", timeout=120)


if __name__ == "__main__":
    main()
