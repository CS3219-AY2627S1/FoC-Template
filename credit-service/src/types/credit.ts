import type { ObjectId } from "mongodb";

export interface CreditAccount {
    _id?: ObjectId;
    userId: string;
    available: number;
    reserved: number;
}

export interface Reservation {
    _id?: ObjectId;
    errandRef: string;
    userId: string;
    amount: number;
    status: 'active' | 'transferred' | 'released';
    createdAt: Date;
}

export type TransactionType = 'allocation' | 'reservation' | 'transfer' | 'release';

export interface Transaction {
    _id?: ObjectId;
    userId: string;
    errandRef?: string;
    type: TransactionType;
    amount: number;
    createdAt: Date;
}
