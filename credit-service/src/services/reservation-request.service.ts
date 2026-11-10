import { randomUUID } from "node:crypto";
import { AppError } from "../errors/errors.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { creditTransaction } from "../libs/credit-transaction.js";
import type { ReservationRequestEvent } from "../schemas/reservation-request-event.schema.js";

function assertSameRequest(
    existing: {
        requestType: "CREATE" | "RENEW";
        orderId: string;
        requesterId: string;
        amount: number;
        previousReservationId: string | null;
    },
    incoming: ReservationRequestEvent,
): void {
    const commonFieldsMatch =
        existing.requestType === incoming.requestType &&
        existing.orderId === incoming.orderId &&
        existing.requesterId === incoming.requesterId &&
        existing.amount === incoming.amount;

    if (!commonFieldsMatch) {
        throw new AppError(
            "Reservation request event ID was reused with different data",
            409,
        );
    }

    if (incoming.requestType === "CREATE") {
        if (existing.previousReservationId !== null) {
            throw new AppError(
                "Reservation request event ID was reused with different data",
                409,
            );
        }

        return;
    }

    if (existing.previousReservationId !== incoming.previousReservationId) {
        throw new AppError(
            "Reservation request event ID was reused with different data",
            409,
        );
    }
}

async function readReplay(
    prisma: PrismaClient,
    incoming: ReservationRequestEvent,
) {
    const existing = await prisma.reservationRequest.findUnique({
        where: { eventId: incoming.eventId },
    });

    if (!existing) return null;

    assertSameRequest(existing, incoming);
    return existing;
}

export async function reservationRequestService(
    prisma: PrismaClient,
    incoming: ReservationRequestEvent,
) {
    try {
        return await creditTransaction(prisma, async tx => {
            // 1. Check if the request has already been processed (idempotency).
            const existing = await tx.reservationRequest.findUnique({
                where: { eventId: incoming.eventId },
            });

            // 2. If it exists, validate that the incoming request matches the existing one.
            if (existing) {
                assertSameRequest(existing, incoming);
                return existing;
            }

            // 3. If it doesn't exist, create a new reservation request record with a PENDING outcome.
            const createdRequest = await tx.reservationRequest.create({
                data: {
                    eventId: incoming.eventId,
                    requestType: incoming.requestType,
                    orderId: incoming.orderId,
                    requesterId: incoming.requesterId,
                    amount: incoming.amount,
                    previousReservationId:
                        incoming.requestType === "RENEW"
                            ? incoming.previousReservationId
                            : null,
                    outcome: "PENDING",
                },
            });

            // 4. Validate the incoming request against the existing one.
            let failureCode: string | null = null;

            //--------------- For renewal requests validation -----------------
            if (incoming.requestType === "RENEW") {
                const previousReservation = await tx.creditReservation.findUnique({
                    where: { id: incoming.previousReservationId! },
                });

                if (!previousReservation) {
                    failureCode = "PREVIOUS_RESERVATION_NOT_FOUND";
                } else if (
                    previousReservation.orderId !== incoming.orderId ||
                    previousReservation.requesterId !== incoming.requesterId ||
                    previousReservation.amount !== incoming.amount
                ) {
                    failureCode = "PREVIOUS_RESERVATION_MISMATCH";
                } else if (
                    previousReservation.status !== "RELEASED" ||
                    previousReservation.settlementReason !== "EXPIRED"
                ) {

                    failureCode = "PREVIOUS_RESERVATION_NOT_RENEWABLE";
                }
            }
            //--------------- End of renewal requests validation -----------------

            // 5. If no failure code has been set, attempt to reserve credits for the requester.
            const account = failureCode
                ? null
                : await tx.creditAccount.findUnique({
                    where: { userId: incoming.requesterId },
                });

            // If the account doesn't exist, set the failure code to indicate that the credit account was not found.
            if (!failureCode && !account) {
                failureCode = "CREDIT_ACCOUNT_NOT_FOUND";
            }

            // If no failure code has been set and the account exists, attempt to reserve credits.
            if (!failureCode && account) {
                // 6. Update the credit account to decrement available credits and increment reserved credits.
                const updated = await tx.creditAccount.updateMany({
                    where: {
                        id: account.id,
                        availableCredits: { gte: incoming.amount },
                        reservedCredits: { lte: 2_147_483_647 - incoming.amount }
                    },
                    data: {
                        availableCredits: { decrement: incoming.amount },
                        reservedCredits: { increment: incoming.amount }
                    },
                });

                if (updated.count !== 1) {
                    failureCode = "INSUFFICIENT_AVAILABLE_CREDITS";
                } else {
                    // 7. Create a new credit reservation record and a corresponding credit transaction record.
                    const reservation = await tx.creditReservation.create({
                        data: {
                            orderId: incoming.orderId,
                            requesterId: incoming.requesterId,
                            accountId: account.id,
                            amount: incoming.amount,
                            requestEventId: createdRequest.eventId,
                        },
                    });

                    await tx.creditTransaction.create({
                        data: {
                            accountId: account.id,
                            reservationId: reservation.id,
                            orderId: incoming.orderId,
                            type: "RESERVATION",
                            amount: incoming.amount,
                            availableDelta: -incoming.amount,
                            reservedDelta: incoming.amount,
                            idempotencyKey: `${reservation.id}:RESERVATION:${account.id}`,
                        }
                    });

                    // 8. Update the reservation request outcome to SUCCEEDED.
                    await tx.reservationRequest.update({
                        where: { eventId: incoming.eventId },
                        data: { outcome: "SUCCEEDED" },
                    });

                    // 9. Create a credit outbox event to indicate that the reservation succeeded.
                    const resultEventId = randomUUID();
                    await tx.creditOutboxEvent.create({
                        data: {
                            id: resultEventId,
                            requestEventId: incoming.eventId,
                            eventType: "CREDIT_RESERVATION_SUCCEEDED",
                            payload: {
                                eventId: resultEventId,
                                correlationId: incoming.eventId,
                                orderId: incoming.orderId,
                                requestType: incoming.requestType,
                                eventType: "CREDIT_RESERVATION_SUCCEEDED",
                                reservationId: reservation.id,
                            },
                        },
                    });

                    return tx.reservationRequest.findUniqueOrThrow({
                        where: { eventId: incoming.eventId },
                    });
                }
            }

            // 10. If a failure code has been set, 
            // update the reservation request outcome to FAILED 
            // and create a credit outbox event to indicate that the reservation failed.
            await tx.reservationRequest.update({
                where: { eventId: incoming.eventId },
                data: { outcome: "FAILED", failureCode },
            });

            const resultEventId = randomUUID();
            await tx.creditOutboxEvent.create({
                data: {
                    id: resultEventId,
                    requestEventId: incoming.eventId,
                    eventType: "CREDIT_RESERVATION_FAILED",
                    payload: {
                        eventId: resultEventId,
                        correlationId: incoming.eventId,
                        orderId: incoming.orderId,
                        requestType: incoming.requestType,
                        eventType: "CREDIT_RESERVATION_FAILED",
                        reasonCode: failureCode,
                    },
                },
            });

            return tx.reservationRequest.findUniqueOrThrow({
                where: { eventId: incoming.eventId },
            });
        });
    } catch (error) {
        // Concurrent redelivery can race on the unique event ID. After the
        // winning transaction commits, return its recorded outcome.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const replay = await readReplay(prisma, incoming);
            if (replay) {
                return replay;
            }
        }

        throw error;
    }
}
