-- Add entry/exit price zone columns to stock_targets
ALTER TABLE stock_targets
  ADD COLUMN IF NOT EXISTS entry_price NUMERIC,
  ADD COLUMN IF NOT EXISTS exit_price  NUMERIC;
