-- Add receipt_photo_url column to expenses table
ALTER TABLE public.expenses 
ADD COLUMN receipt_photo_url text;

COMMENT ON COLUMN public.expenses.receipt_photo_url IS 'URL to receipt photo stored in Supabase Storage';

-- Create storage bucket for expense receipts (PUBLIC like show_cards bucket)
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense_receipts', 'expense_receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for expense receipts
CREATE POLICY "Users can view their own expense receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'expense_receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their own expense receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'expense_receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own expense receipts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'expense_receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own expense receipts"
ON storage.objects FOR DELETE
USING (bucket_id = 'expense_receipts' AND auth.uid()::text = (storage.foldername(name))[1]);