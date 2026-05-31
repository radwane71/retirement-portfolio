-- Add in_portfolio flag to user_stocks (manual toggle per stock)
ALTER TABLE user_stocks
  ADD COLUMN IF NOT EXISTS in_portfolio BOOLEAN NOT NULL DEFAULT FALSE;
