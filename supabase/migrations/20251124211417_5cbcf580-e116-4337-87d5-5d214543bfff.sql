-- Create function to sync cash_transactions when expense amount is updated
CREATE OR REPLACE FUNCTION sync_cash_on_expense_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only act if amount changed
  IF OLD.amount IS DISTINCT FROM NEW.amount THEN
    UPDATE cash_transactions
    SET amount = -NEW.amount
    WHERE related_expense_id = NEW.id
      AND transaction_type = 'auto_expense';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to fire on expense amount updates
CREATE TRIGGER on_expense_amount_update
AFTER UPDATE OF amount ON expenses
FOR EACH ROW
EXECUTE FUNCTION sync_cash_on_expense_update();

-- Create function to sync cash_transactions when transaction revenue is updated
CREATE OR REPLACE FUNCTION sync_cash_on_transaction_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only act if revenue changed
  IF OLD.revenue IS DISTINCT FROM NEW.revenue THEN
    UPDATE cash_transactions
    SET amount = NEW.revenue
    WHERE related_transaction_id = NEW.id
      AND transaction_type = 'auto_sale';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to fire on transaction revenue updates
CREATE TRIGGER on_transaction_revenue_update
AFTER UPDATE OF revenue ON transactions
FOR EACH ROW
EXECUTE FUNCTION sync_cash_on_transaction_update();