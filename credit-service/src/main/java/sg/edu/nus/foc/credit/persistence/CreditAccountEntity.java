/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated the JPA credit account entity based on the provided PostgreSQL schema and requirements.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import sg.edu.nus.foc.credit.credit.CreditAccount;

@Entity
@Table(name = "credit_accounts")
public class CreditAccountEntity {

    @Id
    @Column(name = "user_id", length = 128)
    private String userId;

    @Column(name = "total_balance", nullable = false)
    private long totalBalance;

    @Column(name = "reserved_balance", nullable = false)
    private long reservedBalance;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CreditAccountEntity() {
    }

    CreditAccount toDomain() {
        return new CreditAccount(userId, totalBalance, reservedBalance, createdAt, updatedAt);
    }

    void reserve(long amount, Instant now) {
        reservedBalance = Math.addExact(reservedBalance, amount);
        updatedAt = now;
    }

    void release(long amount, Instant now) {
        reservedBalance = Math.subtractExact(reservedBalance, amount);
        updatedAt = now;
    }

    void pay(long amount, Instant now) {
        totalBalance = Math.subtractExact(totalBalance, amount);
        reservedBalance = Math.subtractExact(reservedBalance, amount);
        updatedAt = now;
    }

    void receive(long amount, Instant now) {
        totalBalance = Math.addExact(totalBalance, amount);
        updatedAt = now;
    }
}
