-- FIX 1: Add user_goals foreign key constraint with CASCADE delete
ALTER TABLE public.user_goals 
ADD CONSTRAINT user_goals_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) 
ON DELETE CASCADE;

-- FIX 2: Add cleanup trigger for lot deletion
CREATE OR REPLACE FUNCTION public.cleanup_cash_on_lot_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM cash_transactions
  WHERE related_lot_id = OLD.id;
  
  RETURN OLD;
END;
$$;

CREATE TRIGGER on_lot_delete_cleanup
BEFORE DELETE ON lots
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_cash_on_lot_delete();

-- FIX 3: Update FK constraints to SET NULL on show deletion
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_show_id_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_show_id_fkey 
FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE SET NULL;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_show_id_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_show_id_fkey 
FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE SET NULL;