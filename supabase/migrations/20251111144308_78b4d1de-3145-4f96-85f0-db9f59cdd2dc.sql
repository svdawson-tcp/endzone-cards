-- Make cost_basis nullable in show_cards table to allow optional entry
ALTER TABLE public.show_cards 
ALTER COLUMN cost_basis DROP NOT NULL;