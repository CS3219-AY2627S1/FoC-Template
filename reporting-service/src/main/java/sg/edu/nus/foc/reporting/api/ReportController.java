/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.api;

import java.util.List;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import sg.edu.nus.foc.reporting.error.BadRequestException;
import sg.edu.nus.foc.reporting.error.ForbiddenException;
import sg.edu.nus.foc.reporting.report.ReportService;
import sg.edu.nus.foc.reporting.report.ReportCreationCoordinator;
import sg.edu.nus.foc.reporting.report.ReportStatus;
import sg.edu.nus.foc.reporting.security.CallerRoles;

@Validated
@RestController
@RequestMapping("/api/reports")
@SecurityRequirement(name = "bearerAuth")
public class ReportController {
    private final ReportService reports;
    private final CallerRoles callerRoles;
    private final ReportCreationCoordinator creations;
    public ReportController(ReportService reports, CallerRoles callerRoles, ReportCreationCoordinator creations) {
        this.reports = reports;
        this.callerRoles = callerRoles;
        this.creations = creations;
    }

    @Operation(summary = "Submit a report with up to five photos")
    @ApiResponse(responseCode = "201", description = "Report created")
    @ApiResponse(responseCode = "200", description = "Completed idempotent submission replayed")
    @ApiResponse(responseCode = "400", description = "Invalid report or photos")
    @ApiResponse(responseCode = "404", description = "Order association unavailable")
    @ApiResponse(responseCode = "409", description = "Required courier missing or report hold conflicts")
    @ApiResponse(responseCode = "503", description = "Order or storage dependency unavailable")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ApiResponse(responseCode = "202", description = "Submission is durably compensating or awaiting recovery")
    ResponseEntity<ReportSubmissionResponse> create(@Valid @RequestPart("report") CreateReportRequest request,
                                          @RequestPart(value = "photos", required = false) List<MultipartFile> photos,
                                          @AuthenticationPrincipal Jwt jwt) {
        return submit(request, photos, jwt);
    }

    @Operation(summary = "Resume an idempotent report submission with the same input")
    @ApiResponse(responseCode = "200", description = "Previously completed report returned")
    @ApiResponse(responseCode = "201", description = "Report completed by this request")
    @ApiResponse(responseCode = "202", description = "Submission remains in compensation or recovery")
    @ApiResponse(responseCode = "409", description = "Submission input differs or submission is terminally fenced")
    @PostMapping(value="/submissions/{submissionId}/resume", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<ReportSubmissionResponse> resume(@PathVariable String submissionId,
            @Valid @RequestPart("report") CreateReportRequest request,
            @RequestPart(value="photos",required=false) List<MultipartFile> photos,
            @AuthenticationPrincipal Jwt jwt) {
        if(!submissionId.equals(request.submissionId())) throw new BadRequestException("Submission path and body differ.","submissionId");
        return submit(request,photos,jwt);
    }

    @Operation(summary = "Get the authenticated caller's report submission status")
    @ApiResponse(responseCode = "200", description = "Current durable submission state")
    @ApiResponse(responseCode = "403", description = "Submission belongs to another caller")
    @ApiResponse(responseCode = "404", description = "Submission not found")
    @GetMapping("/submissions/{submissionId}")
    ReportSubmissionResponse submission(@PathVariable String submissionId,@AuthenticationPrincipal Jwt jwt){
        return ReportSubmissionResponse.from(creations.status(submissionId,jwt.getSubject()));
    }

    @Operation(summary = "Cancel the authenticated caller's pre-hold report submission")
    @ApiResponse(responseCode = "200", description = "Submission cancelled and pending order reservation released")
    @ApiResponse(responseCode = "403", description = "Submission belongs to another caller")
    @ApiResponse(responseCode = "404", description = "Submission not found")
    @ApiResponse(responseCode = "409", description = "Submission has progressed beyond the cancellable states")
    @DeleteMapping("/submissions/{submissionId}")
    ReportSubmissionResponse cancelSubmission(@PathVariable String submissionId,@AuthenticationPrincipal Jwt jwt){
        return ReportSubmissionResponse.from(creations.cancel(submissionId,jwt.getSubject()));
    }

    private ResponseEntity<ReportSubmissionResponse> submit(CreateReportRequest request,List<MultipartFile> photos,Jwt jwt){
        var outcome=creations.submit(request.submissionId(),jwt.getSubject(),"Bearer "+jwt.getTokenValue(),
                request.category(),request.description(),request.orderId(),photos);
        HttpStatus status=outcome.completed()?(outcome.created()?HttpStatus.CREATED:HttpStatus.OK):HttpStatus.ACCEPTED;
        return ResponseEntity.status(status).body(ReportSubmissionResponse.from(outcome));
    }

    PageResponse<ReportResponse> list(int page, int size) {
        var result = reports.list(page, size);
        return new PageResponse<>(result.items().stream().map(r -> ReportResponse.from(r, null, true)).toList(), result.page(), result.size(), result.totalItems(), result.totalPages());
    }

    @Operation(summary = "List reports newest first with optional exact Order ID and status filters")
    @ApiResponse(responseCode = "200", description = "Reports page")
    @PreAuthorize("@callerRoles.isAdmin(authentication)")
    @GetMapping
    PageResponse<ReportResponse> listFiltered(@Parameter(description = "1-based page") @RequestParam(defaultValue = "1") @Min(1) @Max(1000000) int page,
                                      @Parameter(description = "Items per page, up to 100") @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
                                      @Parameter(description = "Exact Order ID") @RequestParam(required = false) @jakarta.validation.constraints.Size(max=36) String orderId,
                                      @Parameter(description = "Report status") @RequestParam(required = false) ReportStatus status) {
        var result = reports.list(page, size, orderId, status);
        return new PageResponse<>(result.items().stream().map(r -> ReportResponse.from(r, null, true)).toList(), result.page(), result.size(), result.totalItems(), result.totalPages());
    }

    @Operation(summary = "List reports submitted by or made against the caller")
    @ApiResponse(responseCode = "200", description = "Caller-scoped reports page")
    @ApiResponse(responseCode = "400", description = "Invalid view or pagination")
    @GetMapping("/mine")
    PageResponse<ReportResponse> mine(
            @Parameter(description = "submitted or against-me") @RequestParam String view,
            @Parameter(description = "1-based page") @RequestParam(defaultValue = "1") @Min(1) int page,
            @Parameter(description = "Items per page, up to 100") @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @AuthenticationPrincipal Jwt jwt) {
        var result = reports.listMine(jwt.getSubject(), view, page, size);
        return new PageResponse<>(result.items().stream().map(r -> ReportResponse.from(r, jwt.getSubject(), false)).toList(), result.page(),
                result.size(), result.totalItems(), result.totalPages());
    }

    @Operation(summary = "Count the authenticated participant's unanswered reports within the response deadline")
    @GetMapping("/mine/response-count")
    @ApiResponse(responseCode = "200", description = "Number of reports the caller can still respond to; expired deadlines are excluded")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    ReportResponseCountResponse responseCount(@AuthenticationPrincipal Jwt jwt) {
        return new ReportResponseCountResponse(reports.awaitingResponseCount(jwt.getSubject()));
    }

    @Operation(summary = "View a report as a participant or administrator")
    @ApiResponse(responseCode = "200", description = "Authorized report details")
    @ApiResponse(responseCode = "403", description = "Caller is not a participant or administrator")
    @ApiResponse(responseCode = "404", description = "Report not found")
    @GetMapping("/{id}")
    ReportResponse detail(@PathVariable String id, @AuthenticationPrincipal Jwt jwt, Authentication authentication) {
        try {
            return ReportResponse.from(reports.detail(id, jwt.getSubject(), false), jwt.getSubject(), false);
        } catch (ForbiddenException denied) {
            if (!callerRoles.isAdmin(authentication)) throw denied;
            return ReportResponse.from(reports.detail(id, jwt.getSubject(), true), jwt.getSubject(), true);
        }
    }

    @Operation(summary = "Download a report attachment")
    @ApiResponse(responseCode = "200", description = "Private attachment bytes", content = @Content(schema = @Schema(type = "string", format = "binary")))
    @ApiResponse(responseCode = "404", description = "Report or attachment not found")
    @GetMapping("/{reportId}/attachments/{attachmentId}")
    ResponseEntity<byte[]> attachment(@PathVariable String reportId, @PathVariable String attachmentId,
                                      @AuthenticationPrincipal Jwt jwt, Authentication authentication) {
        var download = participantAttachment(reportId, attachmentId, jwt.getSubject(), authentication);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore().cachePrivate())
                .header(HttpHeaders.PRAGMA, "no-cache")
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(download.metadata().filename()).build().toString())
                .contentType(MediaType.parseMediaType(download.metadata().contentType())).contentLength(download.bytes().length).body(download.bytes());
    }

    private ReportService.AttachmentDownload participantAttachment(String reportId, String attachmentId,
                                                                   String callerId, Authentication authentication) {
        try {
            return reports.attachment(reportId, attachmentId, callerId, false);
        } catch (ForbiddenException denied) {
            if (!callerRoles.isAdmin(authentication)) throw denied;
            return reports.attachment(reportId, attachmentId, callerId, true);
        }
    }


    @Operation(summary = "Submit the other order participant's response")
    @ApiResponse(responseCode = "200", description = "Participant response saved and report ready for review")
    @ApiResponse(responseCode = "400", description = "Invalid response or photos")
    @ApiResponse(responseCode = "403", description = "Caller is not the complaint respondent")
    @ApiResponse(responseCode = "404", description = "Report not found")
    @ApiResponse(responseCode = "409", description = "Response already submitted or deadline passed")
    @PostMapping(value = "/{id}/response", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ReportResponse respond(@PathVariable String id,
                           @Valid @RequestPart("response") CreateReportResponseRequest request,
                           @RequestPart(value = "photos", required = false) List<MultipartFile> photos,
                           @AuthenticationPrincipal Jwt jwt) {
        return ReportResponse.from(reports.respond(id, jwt.getSubject(), request.explanation(), photos));
    }

    @Operation(summary = "Legacy resolution route: use the command-based resolve endpoint", deprecated = true)
    @ApiResponse(responseCode = "200", description = "Resolved report")
    @ApiResponse(responseCode = "404", description = "Report not found")
    @ApiResponse(responseCode = "409", description = "Use the command-based endpoint with a required admin reply")
    @ApiResponse(responseCode = "503", description = "Order Service could not release the report hold")
    @PreAuthorize("@callerRoles.isAdmin(authentication)")
    @PatchMapping("/{id}/status")
    ReportResponse resolve(@PathVariable String id,
                           @Valid @org.springframework.web.bind.annotation.RequestBody UpdateReportStatusRequest request,
                           @AuthenticationPrincipal Jwt jwt) {
        if (request.status() != ReportStatus.RESOLVED) throw new BadRequestException("Status must be RESOLVED.", "status");
        return ReportResponse.from(reports.resolve(id, "Bearer " + jwt.getTokenValue()));
    }
}
