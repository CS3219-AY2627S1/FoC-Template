CREATE TABLE IF NOT EXISTS favourites (
    user_id UUID,
    supplier_id UUID REFERENCES suppliers(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, supplier_id)
);