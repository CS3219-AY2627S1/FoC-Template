export interface Wallet {
  user_id: string;
  available_credits: number;
  reserved_credits: number;
}

export interface TransactionRecord {
  user_id: string;
  order_id: string | null;
  type: string;
  amount: number;
}
