package sg.edu.nus.foc.order.domain;

public enum OutboxState {
    PENDING,
    IN_PROGRESS,
    PUBLISHED,
    FAILED
}
