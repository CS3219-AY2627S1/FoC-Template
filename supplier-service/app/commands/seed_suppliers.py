# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — implement the specified read-only argparse command, module-relative mappings, contextual JSON diagnostics, validated counts, correction reporting, and batch exit behavior.
# Scope: Writing implementation code; Refactoring and documentation improvements — implement the specified execution-only settings/resources, database preview and import dispatch, contextual decision serialization, proposed/committed counts, safe failures, and CLI help. (ai-20260930-011, Prompt 1)
# Scope: Writing implementation code; Refactoring and documentation improvements — generate reports from the accepted parser snapshot instead of rereading CSV/mappings, preserving contextual issues and reviewed corrections. (ai-20260930-011, Prompt 2)
# Scope: Writing implementation code — report explicit commit outcomes, use null committed/rollback/rejection and inserted values for uncertain commits, retain nonzero exits, and preserve known committed counts after cleanup failures. (ai-20260930-011, Prompt 3)
# Author review: Keith confirmed review of earlier work (ai-20260930-008). Keith also confirmed review of all affected changes under ai-20260930-011 (Prompts 1–3).
# Details: ../../ai/usage-log.md; ai-20260930-008; ai-20260930-011

"""Explicit seed import, or a database-aware --dry-run preview. Import is inert."""

import argparse
import logging
import sys
from collections import Counter
from pathlib import Path

try:
    from foc_observability import configure_logging, log_event
except ModuleNotFoundError:
    # Keep direct CLI execution usable from a source checkout before the
    # shared package has been installed into the active virtual environment.
    repository_root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(repository_root / "packages/foc-observability/src"))
    from foc_observability import configure_logging, log_event

from app.commands.seed_parsing import (
    ParsedSeedBatch,
    SeedSourceResult,
    normalize_seed_source,
    parse_seed_source,
)

SEED_ROOT = Path(__file__).resolve().parents[2] / "seed"
logger = logging.getLogger(__name__)


def dry_run_report(source_path: str | Path) -> dict[str, object]:
    """Build source diagnostics from one load, independently of the database."""
    batch = parse_seed_source(
        source_path, SEED_ROOT / "manifest.json", SEED_ROOT / "area_mapping.json"
    )
    return _source_report(batch)


def _source_report(batch: ParsedSeedBatch) -> dict[str, object]:
    """Report the same snapshot that produced accepted records and issues.

    Diagnostic successes in an invalid batch never become accepted import input.
    Re-normalizing loaded matches for diagnostics is pure and performs no I/O.
    """
    matched = batch.source
    assert matched is not None, "Source reports require a batch from parse_seed_source"
    issues = batch.issues
    records, corrections = [], []
    counts = Counter({name: 0 for name in ("Food", "Coffee", "Shopping", "Printing")})
    for match in matched.matches:
        normalized = normalize_seed_source(SeedSourceResult((match,), ()))
        for record in normalized.records:
            counts.update(record.category_names)
            records.append(
                {
                    "seed_key": record.seed_key,
                    "supplier_id": str(record.supplier_id),
                    "source": {
                        "file": record.source.file,
                        "row_number": record.source.row_number,
                        "Name": record.source.values.get("Name"),
                        "Building": record.source.values.get("Building"),
                    },
                    "values": record.values.model_dump(mode="json"),
                    "category_names": list(record.category_names),
                }
            )
            if match.correct_24_hours:
                corrections.append(
                    {
                        "seed_key": record.seed_key,
                        "supplier_id": str(record.supplier_id),
                        "row_number": record.source.row_number,
                        "source_name": record.source.values.get("Name"),
                        "source_times": {
                            "StartingTime": record.source.values.get("StartingTime"),
                            "ClosingTime": record.source.values.get("ClosingTime"),
                        },
                        "opening_time": record.values.opening_time.isoformat(),
                        "closing_time": record.values.closing_time.isoformat(),
                        "closing_day_offset": record.values.closing_day_offset,
                    }
                )
    valid = not issues
    return {
        "dry_run": True,
        "valid": valid,
        "batch_rejected": not valid,
        "message": (
            "Dry run valid; no data written."
            if valid
            else "Batch rejected; no data written. Review the contextual issues and correct the source or reviewed mappings."
        ),
        "source_count": matched.source_count,
        "validated_supplier_count": len(records),
        "category_counts": dict(counts),
        "total_category_assignments": sum(counts.values()),
        "reviewed_corrections": corrections,
        "validated_records": records,
        "issues": [issue.to_dict() for issue in issues],
    }


def _database_report(report, classification):
    """Serialize decisions for reporting only, never reconstruct import input."""
    report["decisions"] = [
        {
            "seed_key": decision.seed_key,
            "supplier_id": str(decision.supplier_id),
            "file": decision.source.file,
            "row_number": decision.source.row_number,
            "source_name": decision.source.values.get("Name"),
            "source_building": decision.source.values.get("Building"),
            "action": decision.action,
            "reason": decision.reason,
            "category_ids": [str(identity) for identity in decision.category_ids],
        }
        for decision in classification.decisions
    ]
    report["proposed_insert_count"] = sum(
        d.action == "insert" for d in classification.decisions
    )
    report["skipped_count"] = sum(d.action == "skip" for d in classification.decisions)
    report["conflict_count"] = sum(
        d.action == "conflict" for d in classification.decisions
    )
    for decision in classification.decisions:
        for issue in decision.issues:
            report["issues"].append(
                {
                    "file": decision.source.file,
                    "row_number": decision.source.row_number,
                    "seed_key": decision.seed_key,
                    "supplier_id": str(decision.supplier_id),
                    "source_name": decision.source.values.get("Name"),
                    "source_building": decision.source.values.get("Building"),
                    "code": issue.code,
                    "reason": issue.reason,
                    "related_supplier_ids": [
                        str(identity) for identity in issue.related_supplier_ids
                    ],
                }
            )


def _reject(report, code, message, record=None):
    report.update(
        valid=False,
        batch_rejected=True,
        committed=False,
        inserted_count=0,
        message=message,
    )
    issue = {"code": code, "reason": message}
    if record is not None:
        issue.update(
            seed_key=record.seed_key,
            supplier_id=str(record.supplier_id),
            file=record.source.file,
            row_number=record.source.row_number,
            source_name=record.source.values.get("Name"),
            source_building=record.source.values.get("Building"),
        )
    report["issues"].append(issue)


def _report_event(report: dict[str, object]) -> tuple[int, str]:
    """Return the stable event and level for one command report."""

    if report.get("dry_run"):
        if report.get("valid"):
            return logging.INFO, "seed_preview_completed"
        return logging.WARNING, "seed_preview_rejected"
    if report.get("committed") is True:
        return logging.INFO, "seed_import_completed"
    if report.get("commit_outcome") == "unknown":
        return logging.ERROR, "seed_import_outcome_unknown"
    return logging.WARNING, "seed_import_rejected"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import reviewed supplier seeds, or preview database decisions."
    )
    parser.add_argument(
        "--file", required=True, help="Path to the CP1252 supplier source CSV."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview using a read-only database transaction; do not import.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=SEED_ROOT / "manifest.json",
        help="Reviewed permanent seed identities (defaults to packaged manifest).",
    )
    parser.add_argument(
        "--area-mapping",
        type=Path,
        default=SEED_ROOT / "area_mapping.json",
        help="Reviewed campus area mapping (defaults to packaged mapping).",
    )
    configure_logging("supplier-seed", component="seed")
    logging.getLogger("alembic").setLevel(logging.WARNING)
    args = parser.parse_args(argv)
    # Only the typed parser's complete accepted batch can reach persistence.
    batch = parse_seed_source(args.file, args.manifest, args.area_mapping)
    report = _source_report(batch)
    report.update(
        dry_run=args.dry_run,
        preview=args.dry_run,
        committed=False,
        rolled_back=False,
        commit_outcome="not_attempted",
        proposed_insert_count=0,
        inserted_count=0,
        skipped_count=0,
        conflict_count=0,
        decisions=[],
    )
    if not batch.valid or not report["valid"]:
        report.update(
            valid=False,
            batch_rejected=True,
            message="Batch rejected; no data written. Diagnostic validated records are not a partial import.",
        )
    else:
        # No settings, engines, sessions, or application imports at module load.
        from pydantic import ValidationError
        from sqlalchemy.exc import SQLAlchemyError
        from app.config import Settings
        from app.db import create_db_engine, create_session_factory
        from app.services.seed_import import (
            SeedImportError,
            import_seed_batch,
            preview_seed_batch,
        )

        engine = None
        try:
            settings = Settings()
            engine = create_db_engine(settings)
            if args.dry_run:
                session_factory = create_session_factory(engine)
                with session_factory() as session:
                    classification = preview_seed_batch(session, batch)
                _database_report(report, classification)
                report.update(
                    valid=classification.valid,
                    batch_rejected=not classification.valid,
                    message=(
                        "Read-only preview; decisions may change before execution. No data written."
                        if classification.valid
                        else "Preview rejected: the whole batch has conflicts. No data written; decisions may change before execution."
                    ),
                )
            else:
                result = import_seed_batch(engine, batch)
                _database_report(report, result.classification)
                report.update(
                    valid=True,
                    batch_rejected=False,
                    committed=True,
                    commit_outcome="committed",
                    inserted_count=result.inserted_count,
                    skipped_count=result.skipped_count,
                    message="Import committed successfully. Existing identities were preserved.",
                )
        except ValidationError:
            _reject(
                report,
                "CONFIGURATION_ERROR",
                "Invalid configuration. Set DATABASE_URL (postgresql+psycopg) and USER_SERVICE_URL; check optional service settings.",
            )
        except SeedImportError as error:
            if error.classification is not None:
                _database_report(report, error.classification)
            if error.code in {"ACTIVE_DUPLICATE", "IDENTITY_CONFLICT"}:
                report["conflict_count"] += 1
            _reject(report, error.code, str(error), error.record)
            report.update(
                commit_outcome=error.outcome,
                inserted_count=error.inserted_count,
                rolled_back=error.outcome == "rolled_back",
            )
            if error.outcome == "unknown":
                # Neither success nor rejection/rollback has been established.
                report.update(committed=None, rolled_back=None, batch_rejected=None)
            elif error.outcome == "committed":
                report.update(committed=True, batch_rejected=False)
        except SQLAlchemyError:
            _reject(
                report,
                "DATABASE_ERROR",
                "Database access failed. Check database availability, connection settings, and permissions. No successful import was reported.",
            )
        except Exception:
            # Never serialize exception strings: drivers and settings can expose credentials.
            _reject(
                report,
                "EXECUTION_ERROR",
                "Seed command failed. Check service installation and database configuration; no successful import was reported.",
            )
        finally:
            if engine is not None:
                engine.dispose()
    level, event = _report_event(report)
    log_event(logger, level, event, **report)
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
