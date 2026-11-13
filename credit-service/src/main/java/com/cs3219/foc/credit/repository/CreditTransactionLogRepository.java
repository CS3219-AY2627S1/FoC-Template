package com.cs3219.foc.credit.repository;

import com.cs3219.foc.credit.model.entity.CreditTransactionLog;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface CreditTransactionLogRepository extends JpaRepository<CreditTransactionLog, UUID> {
    @Modifying
    @Query(value = """
        INSERT INTO credit_transaction_log(operation_id, errand_id, user_id, courier_id, amount, transaction_type)
        VALUES (:operation, :errand, :user, :courier, :amount, :type)
        """, nativeQuery = true)
    int record(
            @Param("operation") UUID operation,
            @Param("errand") UUID errand,
            @Param("user") UUID user,
            @Param("courier") UUID courier,
            @Param("amount") long amount,
            @Param("type") String type);
}
