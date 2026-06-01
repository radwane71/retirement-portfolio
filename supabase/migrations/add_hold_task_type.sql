-- Migration: Add 'hold' task type
ALTER TABLE portfolio_tasks
  DROP CONSTRAINT IF EXISTS portfolio_tasks_type_check;

ALTER TABLE portfolio_tasks
  ADD CONSTRAINT portfolio_tasks_type_check
  CHECK (type IN ('liquidation','reduction','monitoring','accumulation','hold'));
