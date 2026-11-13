package com.friendoncampus.admin;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CaseViews {
    private CaseViews() { }
    public record Summary(UUID caseId, UUID orderId, AdminCase.State state, UUID reviewerId, long revision, Instant createdAt, String reviewStatus) {
        public Summary(UUID id,UUID order,AdminCase.State state,UUID reviewer,long revision,Instant at){this(id,order,state,reviewer,revision,at,"READY");}
    }
    public record Statement(UUID reporterId, String description, Instant submittedAt) { }
    public record Preparation(UUID operationId,String status,String failureCode) { }
    public record ParticipantReport(Summary caseSummary, Statement ownStatement, Preparation preparation) {
        public ParticipantReport(Summary summary,Statement statement){this(summary,statement,null);}
        @com.fasterxml.jackson.annotation.JsonProperty("case")
        public Summary caseSummary() { return caseSummary; }
    }
    public record Closure(UUID operationId,String resolution,long revision,List<ResolutionService.Explanation> explanations,String creditDisposition) { }
    public record Detail(Summary caseSummary, List<Statement> statements, List<CreditActionService.Action> actions, String resolution,Closure closure) {
        public Detail(Summary summary,List<Statement> statements,List<CreditActionService.Action> actions,String resolution){this(summary,statements,actions,resolution,null);}
        @com.fasterxml.jackson.annotation.JsonProperty("case")
        public Summary caseSummary() { return caseSummary; }
    }
    public record Page(List<Summary> content, int page, int size, long totalElements, int totalPages) { }
    public record Mutation(int status, String body) { }
}
