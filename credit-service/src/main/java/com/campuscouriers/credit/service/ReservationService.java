/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21 to 2026-11-06
 * Scope (AI-61): Implement the Reservation Service logic for the credit service, including methods for reserving, adjusting, releasing and transferring credit.
 * Author review: Code changes were checked and validated
*/

package com.campuscouriers.credit.service;

import com.campuscouriers.credit.dto.ReservationResponse;
import com.campuscouriers.credit.entity.Reservation;
import com.campuscouriers.credit.entity.ReservationStatus;
import com.campuscouriers.credit.entity.Wallet;
import com.campuscouriers.credit.exception.InvalidReservationStateException;
import com.campuscouriers.credit.exception.ReservationNotFoundException;
import com.campuscouriers.credit.exception.WalletNotFoundException;
import com.campuscouriers.credit.exception.WalletSuspendedException;
import com.campuscouriers.credit.exception.DuplicateReservationException;
import com.campuscouriers.credit.exception.IllegalWalletException;
import com.campuscouriers.credit.repository.ReservationRepository;
import com.campuscouriers.credit.repository.WalletRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

import java.util.UUID;

@Service
public class ReservationService {

    private final WalletRepository walletRepository;
    private final ReservationRepository reservationRepository;
    
    private final CreditRecordsService creditRecordsService;
    private final WalletService walletService;

    @Transactional(readOnly = true)
    public void assertOwnedBy(UUID reservationId, UUID userId) {
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(ReservationNotFoundException::new);
        Wallet wallet = walletRepository.findByUserUuid(userId)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.FORBIDDEN, "Reservation is not owned by caller"));
        if (!wallet.getWalletId().equals(reservation.getWalletId())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN, "Reservation is not owned by caller");
        }
    }

    public ReservationService(WalletRepository walletRepository,
                            ReservationRepository reservationRepository,
                            CreditRecordsService creditRecordsService,
                            WalletService walletService) {
        this.walletRepository = walletRepository;
        this.reservationRepository = reservationRepository;
        this.creditRecordsService = creditRecordsService;
        this.walletService = walletService;
    }

    private void markReleased(Reservation reservation) {
        reservation.setStatus(ReservationStatus.RELEASED);
    }

    private void markTransferred(Reservation reservation, UUID courierWalletId) {
        reservation.setCourierWalletId(courierWalletId);
        reservation.setStatus(ReservationStatus.TRANSFERRED);
    }


    @Transactional
    public ReservationResponse reserveCredits(UUID requesterUserId, UUID orderId, long amount) {
        Wallet wallet = walletRepository.findWithLockByUserUuid(requesterUserId)
                .orElseThrow(() -> new WalletNotFoundException("No wallet found"));

        Optional<Reservation> existing = reservationRepository.findByOrderId(orderId);
        if (existing.isPresent()) {
            Reservation found = existing.get();
            if (!found.getWalletId().equals(wallet.getWalletId()) || found.getAmount() != amount) {
                throw new DuplicateReservationException(orderId);
            }
            if (found.getStatus() != ReservationStatus.HELD) {
                throw new InvalidReservationStateException();
            }
            return ReservationResponse.from(found, wallet);        // safe retry
        }

        walletService.reserve(wallet, amount);
        creditRecordsService.recordReserved(wallet, orderId, amount);


        Reservation reservation = reservationRepository.save(
                new Reservation(wallet.getWalletId(), orderId, amount));

        return ReservationResponse.from(reservation, wallet);
    }

    @Transactional
    public ReservationResponse adjustReservation(UUID reservationId, long newAmount) {
        // Lock order is always reservation first, then wallet (keep this for F3/F4 as well)
        Reservation reservation = reservationRepository.findWithLockByReservationId(reservationId)
                .orElseThrow(() -> new ReservationNotFoundException());

        Wallet wallet = walletRepository.findWithLockByWalletId(reservation.getWalletId())
                .orElseThrow(() -> new WalletNotFoundException("No wallet found"));

        if (reservation.getStatus() != ReservationStatus.HELD) {
            throw new InvalidReservationStateException();
        }
        if (!wallet.isActive()) {                  // suspended wallets cannot update errands
            throw new WalletSuspendedException();
        }

        long difference = newAmount - reservation.getAmount();
        if (difference > 0) {
            walletService.reserve(wallet, difference);
        } else if (difference < 0) {
            walletService.release(wallet, -difference);
        }
        reservation.changeAmount(newAmount);

        return ReservationResponse.from(reservation, wallet);
    }

    @Transactional
    public ReservationResponse releaseReservation(UUID reservationId) {
        Reservation reservation = reservationRepository.findWithLockByReservationId(reservationId)
                .orElseThrow(() -> new ReservationNotFoundException());
 
        Wallet wallet = walletRepository.findWithLockByWalletId(reservation.getWalletId())
                .orElseThrow(() -> new WalletNotFoundException("No wallet found"));
 
        if (reservation.getStatus() == ReservationStatus.RELEASED) {
            return ReservationResponse.from(reservation, wallet);      // already released: safe retry
        }
        if (reservation.getStatus() != ReservationStatus.HELD) {       // e.g. already paid to a courier
            throw new InvalidReservationStateException();
        }

        UUID orderId = reservation.getOrderId();

        walletService.release(wallet, reservation.getAmount());
        markReleased(reservation); 
        creditRecordsService.recordReleased(wallet, orderId, reservation.getAmount());

        return ReservationResponse.from(reservation, wallet);
    }

    @Transactional
    public void releaseExpiredErrand(UUID errandId) {
        Reservation reservation = reservationRepository.findByOrderId(errandId)
                .orElseThrow(() -> new ReservationNotFoundException());
        releaseReservation(reservation.getReservationId());
    }


    @Transactional
    public ReservationResponse completeReservation(UUID reservationId, UUID courierUserId, UUID orderId) {
        // Lock order: reservation first, then both wallets in ascending wallet ID order
        Reservation reservation = reservationRepository.findWithLockByReservationId(reservationId)
                .orElseThrow(() -> new ReservationNotFoundException());
        if (!reservation.getOrderId().equals(orderId)) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT, "Order ID does not match reservation");
        }
 
        UUID requesterWalletId = reservation.getWalletId();
 
        // Look up the courier's wallet from their user ID (wallet IDs never change, so no lock needed yet)
        UUID courierWalletId = walletRepository.findByUserUuid(courierUserId)
                .orElseThrow(() -> new WalletNotFoundException("Courier wallet not found"))
                .getWalletId();
 
        if (reservation.getStatus() == ReservationStatus.TRANSFERRED) {
            if (courierWalletId.equals(reservation.getCourierWalletId())) {
                Wallet requesterWallet = walletRepository.findById(requesterWalletId)
                        .orElseThrow(() -> new WalletNotFoundException("No wallet found"));
                return ReservationResponse.from(reservation, requesterWallet);   // safe retry
            }
            throw new InvalidReservationStateException();
        }
        if (reservation.getStatus() != ReservationStatus.HELD) {                 // e.g. RELEASED
            throw new InvalidReservationStateException();
        }
        if (courierWalletId.equals(requesterWalletId)) {
            throw new IllegalWalletException();
        }
 
        // Fixed lock order so two transfers can never wait on each other (deadlock)
        boolean requesterFirst = requesterWalletId.compareTo(courierWalletId) < 0;
        Wallet first = lockWallet(requesterFirst ? requesterWalletId : courierWalletId);
        Wallet second = lockWallet(requesterFirst ? courierWalletId : requesterWalletId);
        Wallet requesterWallet = requesterFirst ? first : second;
        Wallet courierWallet = requesterFirst ? second : first;
 
        walletService.deductFromReserve(requesterWallet, reservation.getAmount());
        walletService.transferToAvailable(courierWallet, reservation.getAmount());
        markTransferred(reservation, courierWalletId);
        creditRecordsService.recordTransferred(requesterWallet, courierWallet, orderId, reservation.getAmount());
        creditRecordsService.recordReceived(courierWallet, requesterWallet, orderId, reservation.getAmount());
 
        return ReservationResponse.from(reservation, requesterWallet);
    }
 
    private Wallet lockWallet(UUID walletId) {
        return walletRepository.findWithLockByWalletId(walletId)
                .orElseThrow(() -> new WalletNotFoundException("No wallet found"));
    }
    
}
