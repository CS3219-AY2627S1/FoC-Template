package sg.edu.nus.foc.order.adapter;

import java.util.concurrent.ConcurrentHashMap;
import java.util.Map;

import lombok.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import sg.edu.nus.foc.order.application.CreditServicePort;
import sg.edu.nus.foc.order.application.SupplierServicePort;
import sg.edu.nus.foc.order.application.UserServicePort;
import sg.edu.nus.foc.order.security.Role;
import sg.edu.nus.foc.order.security.VerifiedOrderCaller;
import sg.edu.nus.foc.order.security.CourierSuspensionAuthority;
import sg.edu.nus.foc.order.domain.CourierAcceptanceDenied;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** Local-only peer adapter with an in-memory credit reservation lifecycle. */
@Component
@Profile("!http")
@ConditionalOnProperty(
        name = "order.peers.mode",
        havingValue = "mock",
        matchIfMissing = true)
public class MockPeerAdapters implements UserServicePort, SupplierServicePort, CreditServicePort {

    private static final long INITIAL_CREDITS = 50;

    private final Map<String, Account> accounts = new ConcurrentHashMap<>();
    private final Map<String, Reservation> reservations = new ConcurrentHashMap<>();
    private final Map<String, Outcome> outcomes = new ConcurrentHashMap<>();

    @Override
    public String verifyRequester(String userId, String authorization) {
        userId = VerifiedOrderCaller.identityFor(Role.REQUESTER, userId).orElse(userId);
        require(userId, "requester");
        account(userId);
        return userId;
    }

    @Override
    public String verifyCourier(String userId, String authorization) {
        userId = VerifiedOrderCaller.identityFor(Role.COURIER, userId).orElse(userId);
        require(userId, "courier");
        account(userId);
        return userId;
    }

    @Override
    public void requireCourierAcceptance(String userId, String authorization) {
        verifyCourier(userId, authorization);
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken caller) {
            for (GrantedAuthority authority : caller.getAuthorities()) {
                if (authority instanceof CourierSuspensionAuthority suspension && suspension.suspended()) {
                    throw new CourierAcceptanceDenied();
                }
            }
        }
        // Explicit local mock accounts have no independent suspension database.
    }

    @Override
    public void validatePair(
            String pickupSupplierId,
            String deliverySupplierId,
            String authorization) {
        require(pickupSupplierId, "pickup supplier");
        require(deliverySupplierId, "delivery supplier");
        if (pickupSupplierId.equals(deliverySupplierId)) {
            throw new IllegalArgumentException("Supplier locations must differ.");
        }
    }

    @Override
    public synchronized void reserve(
            String orderId,
            String requesterId,
            long amount,
            String authorization) {
        require(orderId, "order");
        require(requesterId, "requester");
        requireAmount(amount);

        Reservation existing = reservations.get(orderId);
        if (existing != null) {
            if (!existing.getRequesterId().equals(requesterId)
                    || existing.getAmount() != amount
                    || existing.getState() != ReservationState.RESERVED) {
                throw new IllegalStateException(
                        "Order already has a conflicting credit reservation.");
            }
            return;
        }

        Account account = account(requesterId);
        if (account.available() < amount) {
            throw new IllegalStateException("Insufficient usable credit balance.");
        }
        account.reserved += amount;
        reservations.put(
                orderId,
                new Reservation(requesterId, amount, ReservationState.RESERVED, null));
    }

    @Override
    public synchronized void assignCourier(
            String orderId,
            String courierId,
            String authorization) {
        require(orderId, "order");
        require(courierId, "courier");

        Reservation reservation = reservations.get(orderId);
        if (reservation == null
                || (reservation.getState() != ReservationState.RESERVED
                    && reservation.getState() != ReservationState.HELD_FOR_REOPEN)
                || (reservation.getCourierId() != null && !reservation.getCourierId().equals(courierId))) {
            throw new IllegalStateException("Credit reservation cannot be assigned to this courier.");
        }

        if (courierId.equals(reservation.getCourierId())) {
            return;
        }
        reservations.put(orderId, new Reservation(
                reservation.getRequesterId(), reservation.getAmount(), ReservationState.RESERVED, courierId));
    }

    public synchronized void settle(
            String commandId,
            String orderId,
            String requesterId,
            String courierId,
            long amount,
            String authorization) {
        require(commandId, "credit command");
        require(orderId, "order");
        require(requesterId, "requester");
        require(courierId, "courier");
        requireAmount(amount);

        Outcome previous = outcomes.get(commandId);
        if (previous != null) {
            if (!previous.getOrderId().equals(orderId)
                    || !previous.getKind().equals("SETTLED")) {
                throw new IllegalStateException(
                        "Credit command conflicts with an earlier outcome.");
            }
            return;
        }

        requireReservation(orderId, requesterId, amount);
        Reservation reservation = reservations.get(orderId);
        if (!courierId.equals(reservation.getCourierId())) {
            throw new IllegalStateException("Credit reservation is assigned to a different courier.");
        }
        Account requester = account(requesterId);
        Account courier = account(courierId);
        requester.total -= amount;
        requester.reserved -= amount;
        courier.total += amount;
        reservations.put(
                orderId,
                new Reservation(requesterId, amount, ReservationState.SETTLED, courierId));
        outcomes.put(commandId, new Outcome(orderId, "SETTLED"));
    }

    @Override
    public synchronized void holdForReopen(
            String orderId,
            String authorization) {
        require(orderId, "order");

        Reservation reservation = reservations.get(orderId);
        if (reservation != null
                && reservation.getState() == ReservationState.HELD_FOR_REOPEN
                && reservation.getCourierId() == null) {
            return;
        }
        if (reservation == null
                || reservation.getState() != ReservationState.RESERVED
                || reservation.getCourierId() == null) {
            throw new IllegalStateException("Credit reservation does not match the order being reopened.");
        }
        reservations.put(orderId, new Reservation(
                reservation.getRequesterId(), reservation.getAmount(), ReservationState.HELD_FOR_REOPEN, null));
    }

    /** Test/support view; not a production Credit API. */
    public synchronized CreditSnapshot creditSnapshot(String userId) {
        Account value = account(userId);
        return new CreditSnapshot(value.total, value.reserved, value.available());
    }

    /** ADR-033 local stub compensation ONLY. Never used by an HTTP adapter. */
    public synchronized void compensateCreation(String orderId) {
        Reservation reservation = reservations.get(orderId);
        if (reservation == null) return;
        if (reservation.getState() == ReservationState.SETTLED || reservation.getCourierId() != null) {
            throw new IllegalStateException("Stub reservation cannot be safely reversed.");
        }
        account(reservation.getRequesterId()).reserved -= reservation.getAmount();
        reservations.remove(orderId);
    }

    /** Test/support view; not a production Credit API. */
    public synchronized String reservationState(String orderId) {
        Reservation reservation = reservations.get(orderId);
        return reservation == null ? null : reservation.getState().name();
    }

    /** Test/support view; not a production Credit API. */
    public synchronized String reservationCourier(String orderId) {
        Reservation reservation = reservations.get(orderId);
        return reservation == null ? null : reservation.getCourierId();
    }

    private Account account(String userId) {
        return accounts.computeIfAbsent(userId, ignored -> new Account(INITIAL_CREDITS));
    }

    private void requireReservation(String orderId, String requesterId, long amount) {
        Reservation reservation = reservations.get(orderId);
        if (reservation == null
                || (reservation.getState() != ReservationState.RESERVED
                    && reservation.getState() != ReservationState.HELD_FOR_REOPEN)) {
            throw new IllegalStateException("No active credit reservation exists for order.");
        }
        if (!reservation.getRequesterId().equals(requesterId)
                || reservation.getAmount() != amount) {
            throw new IllegalStateException(
                    "Credit reservation does not match the order outcome.");
        }
    }

    private static void requireAmount(long amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Credit amount must be positive.");
        }
    }

    private static void require(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " is required.");
        }
    }

    @Value
    public static class CreditSnapshot {
        long total;
        long reserved;
        long available;
    }

    @Value
    private static class Outcome {
        String orderId;
        String kind;
    }

    @Value
    private static class Reservation {
        String requesterId;
        long amount;
        ReservationState state;
        String courierId;
    }

    private enum ReservationState {
        RESERVED,
        HELD_FOR_REOPEN,
        SETTLED
    }

    private static final class Account {
        private long total;
        private long reserved;

        private Account(long total) {
            this.total = total;
        }

        private long available() {
            return total - reserved;
        }
    }
}
