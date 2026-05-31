-- Archive (soft-delete) columns — run in Supabase SQL Editor
ALTER TABLE transactions       ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dividends          ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cashflow_entries   ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_stocks        ADD COLUMN IF NOT EXISTS in_portfolio BOOLEAN NOT NULL DEFAULT FALSE;

-- Optional: indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_transactions_archived     ON transactions(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_dividends_archived        ON dividends(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_cashflow_entries_archived ON cashflow_entries(user_id, is_archived);
