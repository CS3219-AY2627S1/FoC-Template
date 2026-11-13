package sg.edu.nus.foc.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(
        name = "command_receipts",
        uniqueConstraints = @UniqueConstraint(
                name = "ux_command_operation",
                columnNames = {"operation", "command_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CommandReceipt {
    @Id
    private String id = UUID.randomUUID().toString();

    @Column(nullable = false, length = 80)
    private String operation;

    @Column(name = "command_id", nullable = false, length = 128)
    private String commandId;

    @Column(name = "order_id", nullable = false, length = 36)
    private String orderId;

    @Column(name = "actor_id", length = 128)
    private String actorId;

    @Column(name = "input_fingerprint", length = 64)
    private String inputFingerprint;

    @Column(nullable = false)
    private Instant recordedAt;

    public CommandReceipt(String operation, String commandId, String orderId, Instant recordedAt) {
        this.operation = operation;
        this.commandId = commandId;
        this.orderId = orderId;
        this.recordedAt = recordedAt;
    }

    public CommandReceipt bind(String actor, String fingerprint) {
        this.actorId = actor;
        this.inputFingerprint = fingerprint;
        return this;
    }

    public void requireBinding(String expectedOrder, String actor, String fingerprint) {
        if (actorId == null || inputFingerprint == null || !orderId.equals(expectedOrder)
                || !actorId.equals(actor) || !inputFingerprint.equals(fingerprint)) {
            throw OrderProblem.conflict("Command ID belongs to different or unbound request details.");
        }
    }

    public static String fingerprint(Object... fields) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            for (Object field : fields) {
                byte[] value = field == null ? new byte[0] : field.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                digest.update(java.nio.ByteBuffer.allocate(4).putInt(field == null ? -1 : value.length).array());
                digest.update(value);
            }
            return java.util.HexFormat.of().formatHex(digest.digest());
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime.", impossible);
        }
    }
}
