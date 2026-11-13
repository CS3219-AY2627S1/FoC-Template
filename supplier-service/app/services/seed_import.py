# AI Assistance Disclosure:
# Tool: Codex (model: GPT-6), date: 2026-09-30
# Scope: Writing implementation code — classify validated ParsedSeedRecord batches into contextual insert, skip, or conflict decisions, compare immutable coordinates, and collect persisted and proposed duplicate conflicts without writes.
# Scope: Writing implementation code; Refactoring and documentation improvements — implement the specified engine-owned atomic import for valid ParsedSeedBatch input, acquire and document advisory lock 3219001 before classification, use READ COMMITTED isolation, preserve skips, return counts after commit, and distinguish named active-duplicate and UUID conflicts from unrelated database errors.
# Scope: Writing implementation code; Refactoring and documentation improvements — add exact nonempty Alembic-head checks and read-only preview transactions, require migration checks before classification, and use the shared session factory for imports. (ai-20260930-011, Prompt 1)
# Scope: Writing implementation code; Refactoring and documentation improvements — distinguish pre-commit, confirmed rollback, unknown, and confirmed committed outcomes; flush before commit, discard uncertain connections, preserve private causes, and return safe reconciliation guidance with unknown inserted counts. (ai-20260930-011, Prompt 3)
# Author review: Keith confirmed review of earlier work (ai-20260930-009; ai-20260930-010). Keith also confirmed review of all affected changes under ai-20260930-011 (Prompts 1–3).
# Details: ../../ai/usage-log.md; ai-20260930-009; ai-20260930-010; ai-20260930-011

"""Read-only classification and service-owned atomic imports of parsed seeds."""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import UUID

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.commands.seed_parsing import ParsedSeedBatch, ParsedSeedRecord, SourceRecord
from app.db import create_session_factory
from app.repositories import suppliers


@dataclass(frozen=True)
class ClassificationIssue:
    code: str
    reason: str
    related_supplier_ids: tuple[UUID, ...] = ()


@dataclass(frozen=True)
class SeedDecision:
    seed_key: str
    supplier_id: UUID
    source: SourceRecord
    action: Literal["insert", "skip", "conflict"]
    reason: str
    category_ids: tuple[UUID, ...]
    issues: tuple[ClassificationIssue, ...]


@dataclass(frozen=True)
class SeedClassification:
    """Decisions are diagnostic only when valid is false; reject the whole batch."""

    decisions: tuple[SeedDecision, ...]

    @property
    def valid(self) -> bool:
        return all(decision.action != "conflict" for decision in self.decisions)


def classify_seed_records(
    session: Session, records: Iterable[ParsedSeedRecord],
) -> SeedClassification:
    """Return input-ordered decisions and all independently detectable conflicts.

    Only missing UUIDs are insert candidates. Existing UUIDs are checked solely
    against immutable coordinates, at PostGIS double precision. No flush, commit,
    rollback, restoration, or update occurs, including with pending caller edits.
    This preflight is not a concurrency guarantee for a later write transaction.
    """
    records = tuple(records)
    categories = suppliers.resolve_category_ids(
        session, {name for record in records for name in record.category_names},
    )
    issues = [[] for _ in records]
    identities = []
    candidates = defaultdict(list)
    for index, record in enumerate(records):
        for name in record.category_names:
            if name not in categories:
                issues[index].append(ClassificationIssue(
                    "MISSING_CATEGORY", f"Migrated category definition {name!r} is missing.",
                ))
        location = record.values.location
        longitude, latitude = float(location.longitude), float(location.latitude)
        identity = suppliers.find_identity(session, record.supplier_id)
        identities.append(identity)
        if identity is not None:
            if (identity.longitude, identity.latitude) != (longitude, latitude):
                issues[index].append(ClassificationIssue(
                    "COORDINATE_MISMATCH",
                    "Existing UUID has different immutable coordinates; review the identity.",
                ))
            continue
        key = suppliers.duplicate_key(session, record.values.name, longitude, latitude)
        candidates[key].append(index)
        duplicates = suppliers.find_active_duplicates(
            session, record.values.name, longitude, latitude,
        )
        if duplicates:
            issues[index].append(ClassificationIssue(
                "ACTIVE_DUPLICATE", "An active supplier has the same normalized name and exact point.",
                duplicates,
            ))
    for indices in candidates.values():
        if len(indices) > 1:
            for index in indices:
                others = tuple(sorted({records[i].supplier_id for i in indices if i != index}))
                issues[index].append(ClassificationIssue(
                    "BATCH_DUPLICATE", "Other proposed identities have the same normalized name and exact point.",
                    others,
                ))
    decisions = []
    for index, record in enumerate(records):
        action = "conflict" if issues[index] else "skip" if identities[index] else "insert"
        reason = (
            "; ".join(issue.reason for issue in issues[index]) if issues[index]
            else "Existing UUID has matching immutable coordinates."
            if identities[index] else "Missing UUID has no active or proposed duplicate."
        )
        decisions.append(SeedDecision(
            record.seed_key, record.supplier_id, record.source, action, reason,
            tuple(categories[name] for name in record.category_names if name in categories),
            tuple(issues[index]),
        ))
    return SeedClassification(tuple(decisions))


# Every supplier seed importer must use this shared transaction-scoped key.
# API writes need not take it: uq_supplier_active_name_location remains the guard.
SEED_IMPORT_LOCK_KEY = 3219001


@dataclass(frozen=True)
class SeedImportResult:
    """Returned only after the entire transaction successfully commits."""

    classification: SeedClassification
    inserted_count: int
    skipped_count: int


ImportOutcome = Literal["not_attempted", "not_committed", "rolled_back", "unknown", "committed"]


class SeedImportError(Exception):
    """Import failure with explicit transaction evidence, not an assumed rollback.

    inserted_count is None when COMMIT may have succeeded without acknowledgement.
    Database exceptions remain private causes; messages are safe for CLI output.
    """

    def __init__(
        self, code: str, message: str,
        classification: SeedClassification | None = None,
        record: ParsedSeedRecord | None = None,
        *, outcome: ImportOutcome = "not_attempted", inserted_count: int | None = 0,
    ):
        super().__init__(message)
        self.code = code
        self.classification = classification
        self.record = record
        self.outcome = outcome
        self.inserted_count = None if outcome == "unknown" else inserted_count


def import_seed_batch(engine: Engine, batch: ParsedSeedBatch) -> SeedImportResult:
    """Import a valid parsed batch under the shared lock in one owned transaction.

    READ COMMITTED makes waiting importers reclassify the preceding commit.
    Failures before commit report zero inserts; only successful rollback is called
    rolled_back. Once COMMIT starts, an exception cannot prove whether PostgreSQL
    committed. Report an unknown outcome even if subsequent rollback succeeds:
    rollback cannot undo a commit whose acknowledgement was lost. No automatic
    retry or reconciliation occurs; an explicit idempotent rerun is safe.
    """
    if not isinstance(batch, ParsedSeedBatch) or not batch.valid:
        raise SeedImportError("INVALID_BATCH", "Import requires a fully valid parsed seed batch.")
    if not isinstance(engine, Engine):
        raise TypeError("Import requires an Engine so the service owns the transaction.")
    classification = None
    record = None
    inserted = 0
    skipped = 0
    outcome: ImportOutcome = "not_attempted"
    try:
        session_factory = create_session_factory(engine.execution_options(isolation_level="READ COMMITTED"))
        with session_factory() as session:
            session.begin()
            outcome = "not_committed"
            try:
                session.execute(select(func.pg_advisory_xact_lock(SEED_IMPORT_LOCK_KEY)))
                require_current_migrations(session)
                classification = classify_seed_records(session, batch.records)
                if not classification.valid:
                    raise SeedImportError(
                        "CLASSIFICATION_CONFLICT", "Seed batch contains conflicts; nothing was imported.",
                        classification,
                    )
                timestamp = datetime.now(timezone.utc)
                for record, decision in zip(batch.records, classification.decisions, strict=True):
                    if decision.action == "skip":
                        skipped += 1
                        continue
                    suppliers.insert_supplier(session, record.supplier_id, record.values, timestamp)
                    suppliers.insert_category_assignments(session, record.supplier_id, decision.category_ids)
                    inserted += 1
                # Finish any pending ORM work while failure still means no COMMIT
                # was attempted. Repository inserts normally execute immediately.
                session.flush()
            except Exception:
                session.rollback()
                outcome = "rolled_back"
                raise
            outcome = "unknown"
            try:
                session.commit()
            except Exception:
                # Discard a connection with uncertain state. Cleanup must neither
                # mask the commit error nor be taken as proof of rollback.
                try:
                    session.invalidate()
                except Exception:
                    pass
                raise
            outcome = "committed"
    except Exception as error:
        if outcome == "unknown":
            raise SeedImportError(
                "COMMIT_OUTCOME_UNKNOWN",
                "Commit confirmation was lost or unavailable; the batch may have been committed. "
                "Reconcile the database using the manifest UUIDs, or rerun the idempotent import "
                "with the same source and mappings once connectivity is restored.",
                classification, outcome=outcome,
            ) from error
        if outcome == "committed":
            raise SeedImportError(
                "RESOURCE_CLEANUP_ERROR", "The import committed, but database resource cleanup failed.",
                classification, outcome=outcome, inserted_count=inserted,
            ) from error
        if isinstance(error, SeedImportError):
            error.outcome = outcome
            raise
        code = "DATABASE_ERROR"
        message = ("Seed import failed; the entire batch was rolled back." if outcome == "rolled_back"
                   else "Seed import failed before COMMIT was attempted; no batch inserts were committed. "
                   "Check database availability and permissions before retrying.")
        if isinstance(error, IntegrityError) and getattr(error.orig, "sqlstate", None) == "23505":
            constraint = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
            if constraint == "uq_supplier_active_name_location":
                code = "ACTIVE_DUPLICATE"
                message = "An active duplicate was inserted concurrently. " + message
            elif constraint == "supplier_pkey":
                code = "IDENTITY_CONFLICT"
                message = "A supplier UUID was inserted concurrently; review the identity. " + message
        raise SeedImportError(code, message, classification, record, outcome=outcome) from error
    return SeedImportResult(classification, inserted, skipped)


ALEMBIC_CONFIG_PATH = Path(__file__).resolve().parents[2] / "alembic.ini"


def require_current_migrations(session: Session) -> None:
    """Match readiness's exact, nonempty Alembic head check without HTTP or DDL."""
    try:
        if not ALEMBIC_CONFIG_PATH.is_file():
            raise ValueError("Missing migration configuration")
        packaged = set(ScriptDirectory.from_config(Config(str(ALEMBIC_CONFIG_PATH))).get_heads())
        if not packaged:
            raise ValueError("Empty packaged heads")
    except Exception as error:
        raise SeedImportError(
            "MIGRATION_CONFIGURATION", "Packaged migrations are unavailable. Repair the service installation before importing.",
        ) from error
    installed = set(MigrationContext.configure(session.connection()).get_current_heads())
    if installed != packaged:
        raise SeedImportError(
            "MIGRATION_MISMATCH",
            "Database migration heads do not match this service. Run the migration deployment procedure for this version, then retry. This command never applies migrations.",
        )


def preview_seed_batch(session: Session, batch: ParsedSeedBatch) -> SeedClassification:
    """Own a read-only preview transaction on a fresh caller-provided session.

    A preview is advisory: import_seed_batch always reclassifies under its lock.
    SET TRANSACTION is the first statement, so PostgreSQL enforces no writes.
    """
    if not isinstance(batch, ParsedSeedBatch) or not batch.valid:
        raise SeedImportError("INVALID_BATCH", "Preview requires a fully valid parsed seed batch.")
    with session.begin():
        session.execute(text("SET TRANSACTION READ ONLY"))
        require_current_migrations(session)
        return classify_seed_records(session, batch.records)
