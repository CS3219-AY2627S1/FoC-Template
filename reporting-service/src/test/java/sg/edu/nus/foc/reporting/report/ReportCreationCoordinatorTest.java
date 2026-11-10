/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex, date: 2026-11-10
 * Mode: Test generation and verification.
 * Scope: Added branch coverage for durable report creation, recovery, and compensation.
 * Author review: User reviewed.
 */
package sg.edu.nus.foc.reporting.report;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import sg.edu.nus.foc.reporting.creation.CreationCompensationMessages;
import sg.edu.nus.foc.reporting.creation.CreationSettings;
import sg.edu.nus.foc.reporting.error.BadRequestException;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.error.DependencyUnavailableException;
import sg.edu.nus.foc.reporting.error.ForbiddenException;
import sg.edu.nus.foc.reporting.error.NotFoundException;
import sg.edu.nus.foc.reporting.order.AssociatedOrder;
import sg.edu.nus.foc.reporting.order.OrderAssociationClient;
import sg.edu.nus.foc.reporting.storage.AttachmentStorage;

class ReportCreationCoordinatorTest {
    private static final Instant NOW = Instant.parse("2026-11-10T00:00:00Z");
    private static final String SUBMISSION = "11111111-1111-1111-1111-111111111111";
    private static final String REPORT = "report-1";
    private static final String REPORTER = "requester";

    @Test
    void createsGeneralAndLinkedReportsAndUploadsDeterministicEvidence() {
        Fixture general = new Fixture(true);
        byte[] png = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
        var image = new ImageValidator.ValidatedImage("proof.png", "image/png", png);
        var item = new ReportSubmission.ManifestItem(0, "attachment", "reports/report-1/submission/attachment",
                "proof.png", "image/png", png.length, ReportSubmissionFingerprint.sha256(png));
        ReportSubmission received = submission(ReportSubmissionState.RECEIVED, ReportCategory.GENERAL, null,
                false, null, List.of(item));
        ReportSubmission evidence = withState(received, ReportSubmissionState.EVIDENCE_STORED, false);
        ReportSubmission completed = withState(evidence, ReportSubmissionState.COMPLETED, false);
        general.absent();
        when(general.images.validate(any())).thenReturn(List.of(image));
        when(general.store.begin(eq(SUBMISSION), eq(REPORTER), anyString(), eq(ReportCategory.GENERAL),
                isNull(), eq("General   issue"), anyList())).thenReturn(new ReportSubmissionStore.Begin(received, true));
        when(general.store.activity(SUBMISSION, REPORTER)).thenReturn(received);
        when(general.store.evidenceStored(SUBMISSION, REPORTER)).thenReturn(evidence);
        when(general.store.complete(eq(SUBMISSION), eq(REPORTER), any(Report.class)))
                .thenReturn(new ReportSubmissionStore.Completion(completed, true));

        var generalOutcome = general.coordinator.submit(SUBMISSION, REPORTER, "Bearer token",
                ReportCategory.GENERAL, "  General   issue ", null,
                List.of(new MockMultipartFile("photos", "proof.png", "image/png", png)));

        assertTrue(generalOutcome.created());
        assertTrue(generalOutcome.completed());
        assertEquals(ReportStatus.READY_FOR_REVIEW, generalOutcome.report().status());
        verify(general.storage).putDeterministic(item.objectKey(), item.contentType(), png, item.sha256());

        Fixture linked = new Fixture(true);
        ReportSubmission linkedReceived = submission(ReportSubmissionState.RECEIVED, ReportCategory.ORDER,
                "order-1", false, null, List.of());
        ReportSubmission linkedEvidence = withState(linkedReceived, ReportSubmissionState.EVIDENCE_STORED, false);
        ReportSubmission pending = withState(linkedEvidence, ReportSubmissionState.HOLD_PENDING, false);
        ReportSubmission linkedCompleted = withState(pending, ReportSubmissionState.COMPLETED, false);
        linked.absent();
        when(linked.images.validate(any())).thenReturn(List.of());
        when(linked.store.begin(anyString(), anyString(), anyString(), eq(ReportCategory.ORDER), eq("order-1"),
                anyString(), anyList())).thenReturn(new ReportSubmissionStore.Begin(linkedReceived, true));
        when(linked.store.evidenceStored(SUBMISSION, REPORTER)).thenReturn(linkedEvidence);
        when(linked.store.acquireHoldLease(eq(SUBMISSION), eq(REPORTER), eq(NOW.plusSeconds(120))))
                .thenReturn(new ReportSubmissionStore.Lease(pending, true));
        when(linked.orders.placeReportHold("order-1", REPORT, SUBMISSION, true, "Bearer token", "REQUESTER"))
                .thenReturn(new AssociatedOrder("order-1", REPORTER, "courier", "DELIVERED", REPORT, true));
        when(linked.store.complete(eq(SUBMISSION), eq(REPORTER), any(Report.class)))
                .thenReturn(new ReportSubmissionStore.Completion(linkedCompleted, true));

        var linkedOutcome = linked.coordinator.submit(SUBMISSION, REPORTER, "Bearer token",
                ReportCategory.ORDER, "Damaged", " order-1 ", List.of());

        assertEquals(ReportStatus.AWAITING_COURIER_RESPONSE, linkedOutcome.report().status());
        assertEquals(NOW.plus(Duration.ofHours(24)), linkedOutcome.report().responseDeadlineAt());
        assertEquals("courier", linkedOutcome.report().courierId());
        assertEquals(REPORTER, linkedOutcome.report().requesterId());
    }

    @Test
    void validatesInputsConfigurationAndOrderHoldSnapshots() {
        assertThrows(IllegalArgumentException.class, () -> new Fixture(true, Duration.ZERO));
        assertThrows(IllegalArgumentException.class, () -> new Fixture(true, Duration.ofSeconds(-1)));
        assertThrows(IllegalArgumentException.class, () -> new Fixture(true, Duration.ofMinutes(11)));

        Fixture disabled = new Fixture(false);
        assertThrows(DependencyUnavailableException.class, () -> disabled.coordinator.submit(SUBMISSION, REPORTER,
                "token", ReportCategory.ORDER, "Issue", "order-1", List.of()));

        Fixture fixture = new Fixture(true);
        assertThrows(BadRequestException.class, () -> fixture.coordinator.submit(SUBMISSION, REPORTER,
                "token", ReportCategory.CREDITS, "Issue", null, List.of()));
        assertThrows(BadRequestException.class, () -> fixture.coordinator.submit(SUBMISSION, REPORTER,
                "token", ReportCategory.ORDER, "Issue", " ", List.of()));
        assertThrows(BadRequestException.class, () -> fixture.coordinator.submit(SUBMISSION, REPORTER,
                "token", ReportCategory.GENERAL, "Issue", "order-1", List.of()));
        assertThrows(BadRequestException.class, () -> fixture.coordinator.submit(SUBMISSION, REPORTER,
                "token", ReportCategory.GENERAL, " \t ", null, List.of()));

        for (AssociatedOrder invalid : List.of(
                new AssociatedOrder("order-1", null, "courier", "DELIVERED", REPORT, true),
                new AssociatedOrder("order-1", "other", "courier", "DELIVERED", REPORT, true),
                new AssociatedOrder("order-1", REPORTER, "courier", "DELIVERED", "other-report", true),
                new AssociatedOrder("order-1", REPORTER, "courier", "DELIVERED", REPORT, false),
                new AssociatedOrder("order-1", REPORTER, "courier", "COMPLETED", REPORT, true),
                new AssociatedOrder("order-1", REPORTER, " ", "DELIVERED", REPORT, true))) {
            Fixture invalidFixture = linkedFixture();
            when(invalidFixture.orders.placeReportHold(anyString(), anyString(), anyString(), anyBoolean(),
                    anyString(), anyString())).thenReturn(invalid);
            var outcome = invalidFixture.coordinator.submit(SUBMISSION, REPORTER, "token",
                    ReportCategory.ORDER, "Issue", "order-1", List.of());
            assertEquals(ReportSubmissionState.COMPENSATING, outcome.submission().state());
        }
    }

    @Test
    void resumesIdempotentlyAndFencesTerminalOrPendingWork() {
        Fixture completedFixture = new Fixture(true);
        ReportSubmission completed = submission(ReportSubmissionState.COMPLETED, ReportCategory.ORDER,
                "order-1", false, null, List.of());
        when(completedFixture.store.get(SUBMISSION, REPORTER)).thenReturn(completed);
        when(completedFixture.images.validate(any())).thenReturn(List.of());
        when(completedFixture.store.begin(anyString(), anyString(), anyString(), any(), any(), anyString(), anyList()))
                .thenReturn(new ReportSubmissionStore.Begin(completed, false));
        Report report = report(ReportStatus.AWAITING_COURIER_RESPONSE);
        when(completedFixture.reports.findById(REPORT)).thenReturn(Optional.of(report));
        assertSame(report, completedFixture.coordinator.submit(SUBMISSION, REPORTER, "token",
                ReportCategory.ORDER, "Issue", "order-1", List.of()).report());
        when(completedFixture.reports.findById(REPORT)).thenReturn(Optional.empty());
        assertThrows(DependencyUnavailableException.class, () -> completedFixture.coordinator.submit(SUBMISSION,
                REPORTER, "token", ReportCategory.ORDER, "Issue", "order-1", List.of()));

        for (ReportSubmissionState state : List.of(ReportSubmissionState.COMPENSATING,
                ReportSubmissionState.REJECTED, ReportSubmissionState.COMPENSATED,
                ReportSubmissionState.RECONCILIATION_REQUIRED)) {
            Fixture replay = replaying(state, false, null);
            if (state == ReportSubmissionState.COMPENSATING) {
                assertNull(replay.coordinator.submit(SUBMISSION, REPORTER, "token", ReportCategory.ORDER,
                        "Issue", "order-1", List.of()).report());
            } else {
                assertThrows(ConflictException.class, () -> replay.coordinator.submit(SUBMISSION, REPORTER,
                        "token", ReportCategory.ORDER, "Issue", "order-1", List.of()));
            }
        }

        Fixture fenced = replaying(ReportSubmissionState.EVIDENCE_STORED, true, null);
        assertThrows(ConflictException.class, () -> fenced.coordinator.submit(SUBMISSION, REPORTER,
                "token", ReportCategory.ORDER, "Issue", "order-1", List.of()));

        Fixture pending = replaying(ReportSubmissionState.HOLD_PENDING, false, NOW.plusSeconds(1));
        assertEquals(ReportSubmissionState.HOLD_PENDING, pending.coordinator.submit(SUBMISSION, REPORTER, "token",
                ReportCategory.ORDER, "Issue", "order-1", List.of()).submission().state());
        Fixture expired = replaying(ReportSubmissionState.HOLD_PENDING, false, NOW);
        ReportSubmission compensating = submission(ReportSubmissionState.COMPENSATING, ReportCategory.ORDER,
                "order-1", true, null, List.of());
        when(expired.store.compensateExpiredHold(SUBMISSION, "HOLD_LEASE_EXPIRED"))
                .thenReturn(Optional.of(compensating));
        assertEquals(ReportSubmissionState.COMPENSATING, expired.coordinator.submit(SUBMISSION, REPORTER, "token",
                ReportCategory.ORDER, "Issue", "order-1", List.of()).submission().state());
    }

    @Test
    void reusesStoredEvidenceAndHandlesUploadOrLeaseFailures() {
        var item = new ReportSubmission.ManifestItem(0, "attachment", "key", "proof.png", "image/png", 8, "sha");
        Fixture reuse = new Fixture(true);
        ReportSubmission evidence = submission(ReportSubmissionState.EVIDENCE_STORED, ReportCategory.GENERAL,
                null, false, null, List.of(item));
        ReportSubmission completed = withState(evidence, ReportSubmissionState.COMPLETED, false);
        when(reuse.store.get(SUBMISSION, REPORTER)).thenReturn(evidence);
        when(reuse.images.validate(any())).thenReturn(List.of());
        when(reuse.store.begin(anyString(), anyString(), anyString(), any(), any(), anyString(), eq(List.of(item))))
                .thenReturn(new ReportSubmissionStore.Begin(evidence, false));
        when(reuse.store.evidenceStored(SUBMISSION, REPORTER)).thenReturn(evidence);
        when(reuse.store.complete(eq(SUBMISSION), eq(REPORTER), any(Report.class)))
                .thenReturn(new ReportSubmissionStore.Completion(completed, true));
        assertTrue(reuse.coordinator.submit(SUBMISSION, REPORTER, "token", ReportCategory.GENERAL,
                "Issue", null, List.of()).completed());
        verifyNoInteractions(reuse.storage);

        Fixture upload = new Fixture(true);
        byte[] png = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
        ReportSubmission received = submission(ReportSubmissionState.RECEIVED, ReportCategory.GENERAL,
                null, false, null, List.of(item));
        ReportSubmission rejected = withState(received, ReportSubmissionState.REJECTED, true);
        upload.absent();
        when(upload.images.validate(any())).thenReturn(List.of(new ImageValidator.ValidatedImage("proof.png", "image/png", png)));
        when(upload.store.begin(anyString(), anyString(), anyString(), any(), any(), anyString(), anyList()))
                .thenReturn(new ReportSubmissionStore.Begin(received, true));
        doThrow(new IllegalStateException()).when(upload.storage).putDeterministic(anyString(), anyString(), any(), anyString());
        when(upload.store.rejectPreHold(SUBMISSION, REPORTER, "Evidence upload failed.")).thenReturn(rejected);
        doThrow(new IllegalStateException("cleanup failed")).when(upload.storage).delete("key");
        assertThrows(IllegalStateException.class, () -> upload.coordinator.submit(SUBMISSION, REPORTER, "token",
                ReportCategory.GENERAL, "Issue", null, List.of()));

        Fixture lease = linkedFixture();
        ReportSubmission evidenceStored = submission(ReportSubmissionState.EVIDENCE_STORED, ReportCategory.ORDER,
                "order-1", false, null, List.of());
        when(lease.store.acquireHoldLease(anyString(), anyString(), any()))
                .thenReturn(new ReportSubmissionStore.Lease(evidenceStored, false));
        assertNull(lease.coordinator.submit(SUBMISSION, REPORTER, "token", ReportCategory.ORDER,
                "Issue", "order-1", List.of()).report());
        verifyNoInteractions(lease.orders);
    }

    @Test
    void compensatesUncertainOrFailedActivationAndRejectsDefinitiveOrderFailures() {
        Fixture uncertain = linkedFixture();
        when(uncertain.orders.placeReportHold(anyString(), anyString(), anyString(), anyBoolean(), anyString(), anyString()))
                .thenThrow(new DependencyUnavailableException("down"));
        ReportSubmission compensating = submission(ReportSubmissionState.COMPENSATING, ReportCategory.ORDER,
                "order-1", true, null, List.of());
        when(uncertain.store.compensate(SUBMISSION, REPORTER, "ORDER_HOLD_UNCERTAIN")).thenReturn(compensating);
        assertEquals(ReportSubmissionState.COMPENSATING, uncertain.coordinator.submit(SUBMISSION, REPORTER, "token",
                ReportCategory.ORDER, "Issue", "order-1", List.of()).submission().state());

        for (RuntimeException definitive : List.of(new BadRequestException("bad", null),
                new NotFoundException("missing"), new ConflictException("conflict"),
                new ForbiddenException("forbidden"))) {
            Fixture fixture = linkedFixture();
            when(fixture.orders.placeReportHold(anyString(), anyString(), anyString(), anyBoolean(), anyString(), anyString()))
                    .thenThrow(definitive);
            ReportSubmission rejected = submission(ReportSubmissionState.REJECTED, ReportCategory.ORDER,
                    "order-1", true, null, List.of());
            when(fixture.store.rejectPreHold(SUBMISSION, REPORTER, definitive.getMessage())).thenReturn(rejected);
            assertThrows(definitive.getClass(), () -> fixture.coordinator.submit(SUBMISSION, REPORTER, "token",
                    ReportCategory.ORDER, "Issue", "order-1", List.of()));
            verify(fixture.store).cleanupCompleted(SUBMISSION);
        }

        Fixture activation = linkedFixture();
        when(activation.orders.placeReportHold(anyString(), anyString(), anyString(), anyBoolean(), anyString(), anyString()))
                .thenReturn(new AssociatedOrder("order-1", REPORTER, "courier", "ACCEPTED", REPORT, true));
        when(activation.store.complete(eq(SUBMISSION), eq(REPORTER), any(Report.class)))
                .thenThrow(new IllegalStateException("write uncertain"));
        ReportSubmission committed = submission(ReportSubmissionState.COMPLETED, ReportCategory.ORDER,
                "order-1", false, null, List.of());
        when(activation.store.compensate(SUBMISSION, REPORTER, "REPORT_ACTIVATION_FAILED")).thenReturn(committed);
        Report report = report(ReportStatus.AWAITING_COURIER_RESPONSE);
        when(activation.reports.findById(REPORT)).thenReturn(Optional.of(report));
        assertSame(report, activation.coordinator.submit(SUBMISSION, REPORTER, "token", ReportCategory.ORDER,
                "Issue", "order-1", List.of()).report());
    }

    @Test
    void supportsErrandStatusCancellationRecoveryAndCompensationCleanup() {
        Fixture errand = linkedFixture(ReportCategory.ERRAND, "courier");
        when(errand.orders.placeReportHold(anyString(), anyString(), anyString(), anyBoolean(), anyString(), eq("COURIER")))
                .thenReturn(new AssociatedOrder("order-1", "requester", "courier", "PICKED_UP", REPORT, true));
        ReportSubmission completed = submission(ReportSubmissionState.COMPLETED, ReportCategory.ERRAND,
                "order-1", false, null, List.of());
        when(errand.store.complete(eq(SUBMISSION), eq("courier"), any(Report.class)))
                .thenReturn(new ReportSubmissionStore.Completion(completed, true));
        assertEquals("requester", errand.coordinator.submit(SUBMISSION, "courier", "token", ReportCategory.ERRAND,
                "Issue", "order-1", List.of()).report().requesterId());

        Fixture lifecycle = new Fixture(true);
        when(lifecycle.store.get(SUBMISSION, REPORTER)).thenReturn(completed);
        when(lifecycle.reports.findById(REPORT)).thenReturn(Optional.empty());
        assertNull(lifecycle.coordinator.status(SUBMISSION, REPORTER).report());
        ReportSubmission rejected = submission(ReportSubmissionState.REJECTED, ReportCategory.GENERAL,
                null, true, null, List.of());
        when(lifecycle.store.cancelPreHold(SUBMISSION, REPORTER)).thenReturn(rejected);
        assertEquals(ReportSubmissionState.REJECTED, lifecycle.coordinator.cancel(SUBMISSION, REPORTER).submission().state());

        when(lifecycle.store.stalePreHold()).thenReturn(List.of("old", "bad"));
        when(lifecycle.store.expirePreHold("old", "INACTIVE_PRE_HOLD_EXPIRED")).thenReturn(Optional.of(rejected));
        when(lifecycle.store.expirePreHold("bad", "INACTIVE_PRE_HOLD_EXPIRED")).thenThrow(new IllegalStateException());
        when(lifecycle.store.expiredHolds()).thenReturn(List.of("expired", "bad-hold"));
        when(lifecycle.store.compensateExpiredHold("bad-hold", "HOLD_LEASE_EXPIRED"))
                .thenThrow(new IllegalStateException());
        when(lifecycle.store.dueCleanup()).thenReturn(List.of("cleanup", "bad-cleanup"));
        when(lifecycle.store.getInternal("cleanup")).thenReturn(rejected);
        when(lifecycle.store.getInternal("bad-cleanup")).thenThrow(new IllegalStateException());
        assertDoesNotThrow(lifecycle.coordinator::recoverExpired);
        verify(lifecycle.store, atLeastOnce()).cleanupCompleted(SUBMISSION);

        String compensation = ReportSubmissionStore.compensationId(SUBMISSION);
        var result = new CreationCompensationMessages.Result("event", compensation, SUBMISSION, REPORT,
                "order-1", REPORTER, 2, "RELEASED");
        ReportSubmission compensated = submission(ReportSubmissionState.COMPENSATED, ReportCategory.ORDER,
                "order-1", true, null, List.of());
        when(lifecycle.store.accept(result)).thenReturn(compensated);
        assertSame(compensated, lifecycle.coordinator.acceptCompensation(result));
    }

    private static Fixture replaying(ReportSubmissionState state, boolean fenced, Instant lease) {
        Fixture fixture = new Fixture(true);
        ReportSubmission saved = submission(state, ReportCategory.ORDER, "order-1", fenced, lease, List.of());
        when(fixture.store.get(SUBMISSION, REPORTER)).thenReturn(saved);
        when(fixture.images.validate(any())).thenReturn(List.of());
        when(fixture.store.begin(anyString(), anyString(), anyString(), any(), any(), anyString(), anyList()))
                .thenReturn(new ReportSubmissionStore.Begin(saved, false));
        return fixture;
    }

    private static Fixture linkedFixture() { return linkedFixture(ReportCategory.ORDER, REPORTER); }

    private static Fixture linkedFixture(ReportCategory category, String reporter) {
        Fixture fixture = new Fixture(true);
        ReportSubmission received = submission(ReportSubmissionState.RECEIVED, category, "order-1", false, null, List.of(), reporter);
        ReportSubmission evidence = withState(received, ReportSubmissionState.EVIDENCE_STORED, false);
        ReportSubmission pending = withState(evidence, ReportSubmissionState.HOLD_PENDING, false);
        when(fixture.store.get(SUBMISSION, reporter)).thenThrow(new NotFoundException("missing"));
        when(fixture.images.validate(any())).thenReturn(List.of());
        when(fixture.store.begin(anyString(), eq(reporter), anyString(), eq(category), eq("order-1"), anyString(), anyList()))
                .thenReturn(new ReportSubmissionStore.Begin(received, true));
        when(fixture.store.evidenceStored(SUBMISSION, reporter)).thenReturn(evidence);
        when(fixture.store.acquireHoldLease(eq(SUBMISSION), eq(reporter), any())).thenReturn(new ReportSubmissionStore.Lease(pending, true));
        when(fixture.store.compensate(SUBMISSION, reporter, "ORDER_HOLD_UNCERTAIN"))
                .thenReturn(submission(ReportSubmissionState.COMPENSATING, category, "order-1", true, null, List.of(), reporter));
        return fixture;
    }

    private static ReportSubmission submission(ReportSubmissionState state, ReportCategory category, String orderId,
            boolean fenced, Instant lease, List<ReportSubmission.ManifestItem> items) {
        return submission(state, category, orderId, fenced, lease, items, REPORTER);
    }

    private static ReportSubmission submission(ReportSubmissionState state, ReportCategory category, String orderId,
            boolean fenced, Instant lease, List<ReportSubmission.ManifestItem> items, String reporter) {
        return new ReportSubmission(SUBMISSION, REPORT, reporter, "fingerprint", category, orderId, "Issue", items,
                state, fenced, 0, 0, null, lease, null, null, null, null, NOW, NOW);
    }

    private static ReportSubmission withState(ReportSubmission source, ReportSubmissionState state, boolean fenced) {
        return new ReportSubmission(source.submissionId(), source.reportId(), source.reporterId(),
                source.inputFingerprint(), source.category(), source.orderId(), source.description(),
                source.attachments(), state, fenced, source.revision() + 1, source.attempts(), null,
                source.leaseUntil(), source.requesterId(), source.courierId(), source.orderStatus(),
                source.lastError(), source.createdAt(), NOW);
    }

    private static Report report(ReportStatus status) {
        return new Report(REPORT, REPORTER, ReportCategory.ORDER, "Issue", "order-1", "courier", status,
                NOW, NOW.plus(Duration.ofHours(24)), null, null, null, List.of(), List.of(), null, null, REPORTER);
    }

    private static CreationSettings settings(boolean enabled) {
        return new CreationSettings(enabled, "demo-foc", "request", "result", "", "", "", "", false);
    }

    private static final class Fixture {
        final ReportSubmissionStore store = mock(ReportSubmissionStore.class);
        final ReportRepository reports = mock(ReportRepository.class);
        final AttachmentStorage storage = mock(AttachmentStorage.class);
        final OrderAssociationClient orders = mock(OrderAssociationClient.class);
        final ImageValidator images = mock(ImageValidator.class);
        final ReportCreationCoordinator coordinator;

        Fixture(boolean enabled) { this(enabled, Duration.ofMinutes(2)); }

        Fixture(boolean enabled, Duration lease) {
            coordinator = new ReportCreationCoordinator(store, reports, storage, orders, images,
                    Clock.fixed(NOW, ZoneOffset.UTC), lease, settings(enabled));
        }

        void absent() { when(store.get(SUBMISSION, REPORTER)).thenThrow(new NotFoundException("missing")); }
    }
}
