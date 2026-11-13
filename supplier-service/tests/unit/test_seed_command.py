# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — test command execution, real-source counts, stable identities, inert import, absent database access, unchanged files, and rejected invalid batches in subprocesses.
# Scope: Writing implementation code — replace obsolete no-database execution assertions while preserving inert import and parser isolation; test safe configuration failures, resource disposal, source reports, and migration-head validation. (ai-20260930-011, Prompt 1)
# Scope: Writing implementation code — add valid/invalid snapshot regressions that change CSV and mappings after parsing and verify diagnostic values, issues, corrections, and typed importer input remain consistent. (ai-20260930-011, Prompt 2)
# Author review: Keith confirmed review of earlier work (ai-20260930-008). Keith also confirmed review of all affected changes under ai-20260930-011 (Prompts 1–3).
# Details: ../../ai/usage-log.md; ai-20260930-008; ai-20260930-011

"""Pure source diagnostics, inert imports, and safe command failure contracts."""

import csv
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest

SERVICE = Path(__file__).resolve().parents[2]
CSV = SERVICE.parent / "data/csv/supplier-seed-data.csv"
MAPPINGS = [SERVICE / "seed/manifest.json", SERVICE / "seed/area_mapping.json"]
MODULE = "app.commands.seed_suppliers"


def environment():
    env = {key: value for key, value in os.environ.items() if not any(
        token in key.upper() for token in ("DATABASE", "POSTGRES", "USER_SERVICE", "AUTH_TIMEOUT")
    )}
    env["PYTHONPATH"] = str(SERVICE)
    return env


def run(*args, cwd=SERVICE):
    return subprocess.run([sys.executable, "-m", MODULE, *map(str, args)], cwd=cwd,
                          env=environment(), capture_output=True, text=True, check=False)


def write_source(path, mutate=None, reverse=False):
    with CSV.open(encoding="cp1252", newline="") as stream:
        reader = csv.DictReader(stream)
        headers, rows = reader.fieldnames, list(reader)
    if mutate:
        mutate(rows)
    with path.open("w", encoding="cp1252", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=headers)
        writer.writeheader()
        writer.writerows(reversed(rows) if reverse else rows)


def test_source_reports_remain_database_independent_and_stable(tmp_path):
    from app.commands.seed_suppliers import dry_run_report
    before = {path: path.read_bytes() for path in [CSV, *MAPPINGS]}
    reordered = tmp_path / "reordered.csv"
    write_source(reordered, reverse=True)
    reports = []
    for path in (CSV, CSV, reordered):
        report = dry_run_report(path)
        assert report["valid"] and not report["batch_rejected"]
        assert report["source_count"] == report["validated_supplier_count"] == 21
        assert report["category_counts"] == {"Food": 16, "Coffee": 5, "Shopping": 3, "Printing": 2}
        assert report["total_category_assignments"] == 26
        assert len(report["reviewed_corrections"]) == 5
        assert not report["issues"]
        reports.append(report)
    def identities(report):
        return {item["seed_key"]: item["supplier_id"] for item in report["validated_records"]}
    assert identities(reports[0]) == identities(reports[1]) == identities(reports[2])
    expected = {entry["seed_key"] for entry in json.loads(MAPPINGS[0].read_text()) if entry["correct_24_hours"]}
    for report in reports:
        assert {item["seed_key"] for item in report["reviewed_corrections"]} == expected
        assert all(item["closing_day_offset"] == 1 for item in report["reviewed_corrections"])
    assert {path: path.read_bytes() for path in before} == before


def test_multiple_failures_reject_batch_but_count_only_validated_records(tmp_path):
    path = tmp_path / "invalid.csv"
    def mutate(rows):
        rows[0].update(Type="Unknown//Food", StartingTime="900hrs", Latitude="NaN", ImageURL="https://elsewhere/ANNA.jpeg")
        rows[1]["Longitude"] = "181"
    write_source(path, mutate)
    completed = run("--file", path, "--dry-run")
    assert completed.returncode == 1 and "Traceback" not in completed.stderr
    report = json.loads(completed.stdout)
    assert report["schema_version"] == 1
    assert report["service"] == "supplier-seed"
    assert report["component"] == "seed"
    assert report["event"] == "seed_preview_rejected"
    assert report["batch_rejected"] and not report["valid"]
    assert report["source_count"] == 21 and report["validated_supplier_count"] == 19
    assert report["total_category_assignments"] == sum(report["category_counts"].values())
    assert {"UNKNOWN_CATEGORY", "BLANK_CATEGORY", "INVALID_SOURCE_TIME", "INVALID_COORDINATE",
            "UNKNOWN_IMAGE", "COORDINATE_OUT_OF_RANGE"} <= {issue["code"] for issue in report["issues"]}
    assert all(issue["file"] and issue["row_number"] and issue["seed_key"] for issue in report["issues"])
    assert "Batch rejected" in report["message"]


@pytest.mark.parametrize("args", [[], ["--dry-run"]])
def test_usage_requires_source(args):
    completed = run(*args)
    assert completed.returncode != 0
    assert "usage:" in completed.stderr and "Traceback" not in completed.stderr


def test_unreadable_source(tmp_path):
    completed = run("--file", tmp_path / "missing.csv", "--dry-run")
    report = json.loads(completed.stdout)
    assert completed.returncode == 1 and report["batch_rejected"]
    assert "SOURCE_READ_ERROR" in {issue["code"] for issue in report["issues"]}
    assert "Traceback" not in completed.stderr


def test_missing_mappings_are_reported_without_traceback(tmp_path):
    code = f"""
from pathlib import Path
from app.commands import seed_suppliers
seed_suppliers.SEED_ROOT = Path({str(tmp_path)!r})
raise SystemExit(seed_suppliers.main(['--file', {str(CSV)!r}, '--dry-run']))
"""
    completed = subprocess.run([sys.executable, "-c", code], env=environment(), cwd=tmp_path,
                               capture_output=True, text=True)
    assert completed.returncode == 1 and "Traceback" not in completed.stderr
    report = json.loads(completed.stdout)
    assert report["batch_rejected"] and not report["validated_records"]
    assert "JSON_READ_ERROR" in {issue["code"] for issue in report["issues"]}


def test_import_is_inert_and_parser_never_imports_database_modules(tmp_path):
    code = f"""
import contextlib
import importlib.abc
import io
import sys
class RejectDatabase(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in {{'sqlalchemy', 'psycopg', 'psycopg2'}} or fullname in {{'app.db', 'app.config', 'app.main'}}:
            raise AssertionError('Unexpected database/application import: ' + fullname)
sys.meta_path.insert(0, RejectDatabase())
sys.argv = ['test', '--invalid-import-argument']
output = io.StringIO()
with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
    from app.commands.seed_suppliers import dry_run_report
assert output.getvalue() == ''
assert dry_run_report({str(CSV)!r})['valid']
"""
    completed = subprocess.run([sys.executable, "-c", code], cwd=tmp_path, env=environment(),
                               capture_output=True, text=True)
    assert completed.returncode == 0, completed.stderr
    assert completed.stdout == ""


@pytest.mark.parametrize("dry_run", [False, True])
def test_valid_input_requires_configuration(dry_run, tmp_path):
    args = ["--file", CSV] + (["--dry-run"] if dry_run else [])
    completed = run(*args, cwd=tmp_path)
    assert completed.returncode == 1 and "Traceback" not in completed.stderr
    report = json.loads(completed.stdout)
    assert report["source_count"] == report["validated_supplier_count"] == 21
    assert report["issues"][-1]["code"] == "CONFIGURATION_ERROR"
    assert report["inserted_count"] == 0 and not report["committed"]


@pytest.mark.parametrize("dry_run", [False, True])
def test_resources_disposed_and_database_errors_sanitized(monkeypatch, capsys, dry_run):
    from sqlalchemy.exc import OperationalError
    from app import db
    from app.services import seed_import
    from app.commands.seed_suppliers import main

    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:secret@localhost/supplier_test")
    monkeypatch.setenv("USER_SERVICE_URL", "https://localhost:8000")
    disposed, closed = [], []

    class Engine:
        def dispose(self):
            disposed.append(True)

    class Session:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            closed.append(True)

    def fail(*args):
        raise OperationalError("secret sql", {}, RuntimeError("password=super-secret"))

    monkeypatch.setattr(db, "create_db_engine", lambda settings: Engine())
    monkeypatch.setattr(db, "create_session_factory", lambda engine: Session)
    monkeypatch.setattr(seed_import, "preview_seed_batch", fail)
    monkeypatch.setattr(seed_import, "import_seed_batch", fail)
    assert main(["--file", str(CSV)] + (["--dry-run"] if dry_run else [])) == 1
    output = capsys.readouterr()
    assert "secret" not in output.out + output.err and "Traceback" not in output.err
    assert json.loads(output.out)["issues"][-1]["code"] == "DATABASE_ERROR"
    assert disposed == [True] and closed == ([True] if dry_run else [])


@pytest.mark.parametrize("heads", [[], ["0001"], ["9999"], ["0002", "branch"]])
def test_migration_gate_rejects_nonmatching_heads(monkeypatch, heads):
    from unittest.mock import Mock
    from app.services import seed_import

    monkeypatch.setattr(seed_import.MigrationContext, "configure", lambda connection: Mock(get_current_heads=lambda: heads))
    with pytest.raises(seed_import.SeedImportError) as caught:
        seed_import.require_current_migrations(Mock())
    assert caught.value.code == "MIGRATION_MISMATCH"


def test_migration_gate_rejects_empty_packaged_heads(monkeypatch):
    from unittest.mock import Mock
    from app.services import seed_import

    monkeypatch.setattr(seed_import.ScriptDirectory, "from_config", lambda config: Mock(get_heads=lambda: []))
    session = Mock()
    with pytest.raises(seed_import.SeedImportError) as caught:
        seed_import.require_current_migrations(session)
    assert caught.value.code == "MIGRATION_CONFIGURATION"
    session.connection.assert_not_called()


@pytest.mark.parametrize('dry_run', [False, True])
def test_resources_disposed_after_success(monkeypatch, capsys, dry_run):
    from app import db
    from app.services import seed_import
    from app.commands.seed_suppliers import main

    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://user:secret@localhost/supplier_test')
    monkeypatch.setenv('USER_SERVICE_URL', 'https://localhost:8000')
    disposed, closed = [], []

    class Engine:
        def dispose(self):
            disposed.append(True)

    class Session:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            closed.append(True)

    classification = seed_import.SeedClassification(())
    monkeypatch.setattr(db, 'create_db_engine', lambda settings: Engine())
    monkeypatch.setattr(db, 'create_session_factory', lambda engine: Session)
    monkeypatch.setattr(seed_import, 'preview_seed_batch', lambda *args: classification)
    monkeypatch.setattr(seed_import, 'import_seed_batch', lambda *args: seed_import.SeedImportResult(classification, 0, 0))
    assert main(['--file', str(CSV)] + (['--dry-run'] if dry_run else [])) == 0
    report = json.loads(capsys.readouterr().out)
    assert report['valid'] and report['committed'] == (not dry_run)
    assert disposed == [True] and closed == ([True] if dry_run else [])


def test_missing_packaged_migrations_are_actionable(monkeypatch, tmp_path):
    from unittest.mock import Mock
    from app.services import seed_import

    monkeypatch.setattr(seed_import, 'ALEMBIC_CONFIG_PATH', tmp_path / 'absent.ini')
    with pytest.raises(seed_import.SeedImportError) as caught:
        seed_import.require_current_migrations(Mock())
    assert caught.value.code == 'MIGRATION_CONFIGURATION'


@pytest.mark.parametrize('invalid_snapshot', [False, True])
def test_command_report_and_import_use_same_snapshot(tmp_path, monkeypatch, capsys, invalid_snapshot):
    from app import db
    from app.commands import seed_suppliers
    from app.services import seed_import

    source = tmp_path / 'source.csv'
    write_source(source, (lambda rows: rows[0].update(Latitude='NaN')) if invalid_snapshot else None)
    mappings = tmp_path / 'seed'
    mappings.mkdir()
    for path in MAPPINGS:
        (mappings / path.name).write_bytes(path.read_bytes())
    monkeypatch.setattr(seed_suppliers, 'SEED_ROOT', mappings)
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://localhost/supplier_test')
    monkeypatch.setenv('USER_SERVICE_URL', 'https://localhost:8000')
    original_parse = seed_suppliers.parse_seed_source
    snapshots, imported = [], []

    def parse_then_change_files(*args):
        batch = original_parse(*args)
        snapshots.append(batch)
        # Replace input after acceptance but before report construction/import.
        write_source(source, lambda rows: rows[0].update(Type='Coffee', Floor='changed-after-parse'))
        (mappings / 'manifest.json').write_text('[]')
        (mappings / 'area_mapping.json').write_text('{}')
        return batch

    class Engine:
        def dispose(self):
            pass

    def capture_import(engine, batch):
        imported.append(batch)
        return seed_import.SeedImportResult(seed_import.SeedClassification(()), len(batch.records), 0)

    monkeypatch.setattr(seed_suppliers, 'parse_seed_source', parse_then_change_files)
    monkeypatch.setattr(db, 'create_db_engine', lambda settings: Engine())
    monkeypatch.setattr(seed_import, 'import_seed_batch', capture_import)
    assert seed_suppliers.main(['--file', str(source)]) == (1 if invalid_snapshot else 0)
    report = json.loads(capsys.readouterr().out)
    batch, = snapshots
    assert report['source_count'] == 21
    assert len(report['reviewed_corrections']) == 5
    assert report['issues'] == [issue.to_dict() for issue in batch.issues]
    if invalid_snapshot:
        assert not imported and batch.records == ()
        assert report['validated_supplier_count'] == 20 and report['inserted_count'] == 0
        assert report['issues'][0]['row_number'] == 2 and report['issues'][0]['seed_key']
    else:
        assert imported == [batch] and imported[0] is batch
        assert report['validated_supplier_count'] == report['inserted_count'] == 21
        assert report['category_counts'] == {'Food': 16, 'Coffee': 5, 'Shopping': 3, 'Printing': 2}
        for record, diagnostic in zip(batch.records, report['validated_records'], strict=True):
            assert diagnostic['values'] == record.values.model_dump(mode='json')
            assert diagnostic['supplier_id'] == str(record.supplier_id)
            assert diagnostic['category_names'] == list(record.category_names)


def test_explicit_manifest_and_area_mapping_options(tmp_path):
    manifest = json.loads(MAPPINGS[0].read_text())
    replacement = "8f9367c5-af4d-4431-83a2-366419247cca"
    manifest[0]["supplier_id"] = replacement
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest))
    completed = run("--file", CSV, "--manifest", manifest_path,
                    "--area-mapping", MAPPINGS[1], "--dry-run")
    result = json.loads(completed.stdout)
    assert result["source_count"] == result["validated_supplier_count"] == 21
    assert result["validated_records"][0]["supplier_id"] == replacement
    assert {issue["code"] for issue in result["issues"]} == {"CONFIGURATION_ERROR"}
