-- ============================================
-- ENDZONE V2.0 DATABASE SCHEMA
-- Created: November 10, 2025
-- Architecture Decision: AD-2025-003
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE 1: LOTS (Purchase Containers)
-- NO card counting fields - cost containers only
-- ============================================

CREATE TABLE lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_date DATE NOT NULL,
  source TEXT NOT NULL,
  total_cost DECIMAL(10,2) NOT NULL CHECK (total_cost >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')) DEFAULT 'active',
  closure_reason TEXT,
  closure_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lots_user_id ON lots(user_id);
CREATE INDEX idx_lots_status ON lots(status);
CREATE INDEX idx_lots_purchase_date ON lots(purchase_date DESC);

ALTER TABLE lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lots"
  ON lots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own lots"
  ON lots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lots"
  ON lots FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own lots"
  ON lots FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TABLE 2: SHOW_CARDS (Premium Inventory)
-- Individual card tracking with photos
-- ============================================

CREATE TABLE show_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES lots(id) ON DELETE RESTRICT,
  player_name TEXT NOT NULL,
  year TEXT,
  card_details JSONB,
  cost_basis DECIMAL(10,2) NOT NULL CHECK (cost_basis >= 0),
  asking_price DECIMAL(10,2) CHECK (asking_price >= 0),
  status TEXT NOT NULL CHECK (status IN ('available', 'sold', 'lost', 'combined')) DEFAULT 'available',
  disposition_type TEXT CHECK (disposition_type IN ('discard', 'lost', 'combined_into')),
  destination_lot_id UUID REFERENCES lots(id),
  photo_front_url TEXT,
  photo_back_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT disposition_type_required CHECK (
    (status IN ('lost', 'combined') AND disposition_type IS NOT NULL) OR
    (status NOT IN ('lost', 'combined'))
  )
);

CREATE INDEX idx_show_cards_user_id ON show_cards(user_id);
CREATE INDEX idx_show_cards_lot_id ON show_cards(lot_id);
CREATE INDEX idx_show_cards_status ON show_cards(status);
CREATE INDEX idx_show_cards_player_name ON show_cards(player_name);
CREATE INDEX idx_show_cards_year ON show_cards(year);
CREATE INDEX idx_show_cards_player_search ON show_cards USING gin(to_tsvector('english', player_name));

ALTER TABLE show_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own show cards"
  ON show_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own show cards"
  ON show_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own show cards"
  ON show_cards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own show cards"
  ON show_cards FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TABLE 3: SHOWS (Event Management)
-- Show-level ROI tracking
-- ============================================

CREATE TABLE shows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  show_date DATE NOT NULL,
  location TEXT,
  table_cost DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (table_cost >= 0),
  booth_number TEXT,
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'completed')) DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shows_user_id ON shows(user_id);
CREATE INDEX idx_shows_status ON shows(status);
CREATE INDEX idx_shows_show_date ON shows(show_date DESC);

ALTER TABLE shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shows"
  ON shows FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shows"
  ON shows FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shows"
  ON shows FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own shows"
  ON shows FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TABLE 4: EXPENSES (Cost Tracking)
-- Business expenses (show tables, supplies, etc.)
-- Created BEFORE transactions/cash_transactions
-- ============================================

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  category TEXT NOT NULL,
  show_id UUID REFERENCES shows(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_show_id ON expenses(show_id);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date DESC);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own expenses"
  ON expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expenses"
  ON expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses"
  ON expenses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses"
  ON expenses FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TABLE 5: TRANSACTIONS (Card Movements)
-- Sales, bulk sales, dispositions
-- ============================================

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('show_card_sale', 'bulk_sale', 'disposition')),
  lot_id UUID REFERENCES lots(id),
  show_card_id UUID REFERENCES show_cards(id),
  show_id UUID REFERENCES shows(id),
  quantity INTEGER CHECK (quantity > 0),
  revenue DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT show_card_required CHECK (
    (transaction_type IN ('show_card_sale', 'disposition') AND show_card_id IS NOT NULL) OR
    (transaction_type = 'bulk_sale')
  ),
  
  CONSTRAINT bulk_sale_fields CHECK (
    (transaction_type = 'bulk_sale' AND lot_id IS NOT NULL AND quantity IS NOT NULL) OR
    (transaction_type IN ('show_card_sale', 'disposition'))
  )
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_lot_id ON transactions(lot_id);
CREATE INDEX idx_transactions_show_card_id ON transactions(show_card_id);
CREATE INDEX idx_transactions_show_id ON transactions(show_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TABLE 6: CASH_TRANSACTIONS (Business Finance)
-- Track all cash movements
-- Created LAST to reference all other tables
-- ============================================

CREATE TABLE cash_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'deposit', 
    'withdrawal', 
    'adjustment', 
    'auto_sale',
    'auto_purchase',
    'auto_expense'
  )),
  amount DECIMAL(10,2) NOT NULL,
  related_transaction_id UUID REFERENCES transactions(id),
  related_expense_id UUID REFERENCES expenses(id),
  related_lot_id UUID REFERENCES lots(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cash_transactions_user_id ON cash_transactions(user_id);
CREATE INDEX idx_cash_transactions_type ON cash_transactions(transaction_type);
CREATE INDEX idx_cash_transactions_created_at ON cash_transactions(created_at DESC);

ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cash transactions"
  ON cash_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cash transactions"
  ON cash_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cash transactions"
  ON cash_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- DATABASE TRIGGERS
-- Auto-generate cash transactions
-- ============================================

CREATE OR REPLACE FUNCTION auto_create_cash_from_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE TRIGGER trigger_auto_cash_from_sale
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION auto_create_cash_from_sale();

CREATE OR REPLACE FUNCTION auto_create_cash_from_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE TRIGGER trigger_auto_cash_from_purchase
AFTER INSERT ON lots
FOR EACH ROW
EXECUTE FUNCTION auto_create_cash_from_purchase();

CREATE OR REPLACE FUNCTION auto_create_cash_from_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE TRIGGER trigger_auto_cash_from_expense
AFTER INSERT ON expenses
FOR EACH ROW
EXECUTE FUNCTION auto_create_cash_from_expense();

CREATE OR REPLACE FUNCTION update_show_card_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE TRIGGER trigger_update_show_card_on_sale
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_show_card_on_sale();

-- ============================================
-- UPDATED_AT TRIGGERS
-- Auto-update timestamps
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_lots_updated_at
BEFORE UPDATE ON lots
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_show_cards_updated_at
BEFORE UPDATE ON show_cards
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shows_updated_at
BEFORE UPDATE ON shows
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();