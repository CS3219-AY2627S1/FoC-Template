CREATE TABLE IF NOT EXISTS wallets (
  user_id UUID PRIMARY KEY, 
  available_credits INTEGER NOT NULL DEFAULT 10 CHECK (available_credits >= 0),
  reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS transaction_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID,
  type VARCHAR(32) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES wallets(user_id),
  CHECK (type = 'INITIAL' OR order_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tx_order_id ON transaction_records(order_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_id ON transaction_records(user_id);