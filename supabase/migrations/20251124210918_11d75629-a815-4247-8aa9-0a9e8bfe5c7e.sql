-- Create function to sync cash_transactions when lot total_cost is updated
CREATE OR REPLACE FUNCTION sync_cash_on_lot_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only act if total_cost changed
  IF OLD.total_cost IS DISTINCT FROM NEW.total_cost THEN
    UPDATE cash_transactions
    SET amount = -NEW.total_cost
    WHERE related_lot_id = NEW.id
      AND transaction_type = 'auto_purchase';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to fire on lot total_cost updates
CREATE TRIGGER on_lot_cost_update
AFTER UPDATE OF total_cost ON lots
FOR EACH ROW
EXECUTE FUNCTION sync_cash_on_lot_update();