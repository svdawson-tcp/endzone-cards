-- ============================================
-- FIX SECURITY WARNINGS: Set search_path for all functions
-- ============================================

-- Fix 1: auto_create_cash_from_sale
CREATE OR REPLACE FUNCTION auto_create_cash_from_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_type IN ('show_card_sale', 'bulk_sale') AND NEW.revenue > 0 THEN
    INSERT INTO cash_transactions (
      user_id,
      transaction_type,
      amount,
      related_transaction_id,
      created_at
    ) VALUES (
      NEW.user_id,
      'auto_sale',
      NEW.revenue,
      NEW.id,
      NEW.created_at
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix 2: auto_create_cash_from_purchase
CREATE OR REPLACE FUNCTION auto_create_cash_from_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO cash_transactions (
    user_id,
    transaction_type,
    amount,
    related_lot_id,
    created_at
  ) VALUES (
    NEW.user_id,
    'auto_purchase',
    -NEW.total_cost,
    NEW.id,
    NEW.created_at
  );
  
  RETURN NEW;
END;
$$;

-- Fix 3: auto_create_cash_from_expense
CREATE OR REPLACE FUNCTION auto_create_cash_from_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO cash_transactions (
    user_id,
    transaction_type,
    amount,
    related_expense_id,
    created_at
  ) VALUES (
    NEW.user_id,
    'auto_expense',
    -NEW.amount,
    NEW.id,
    NOW()
  );
  
  RETURN NEW;
END;
$$;

-- Fix 4: update_show_card_on_sale
CREATE OR REPLACE FUNCTION update_show_card_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_type = 'show_card_sale' AND NEW.show_card_id IS NOT NULL THEN
    UPDATE show_cards
    SET status = 'sold', updated_at = NOW()
    WHERE id = NEW.show_card_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix 5: update_updated_at_column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;