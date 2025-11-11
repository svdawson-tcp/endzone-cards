-- Create storage bucket for show card photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('show_cards', 'show_cards', true);

-- Create RLS policies for show_cards bucket
CREATE POLICY "Users can view all show card photos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'show_cards');

CREATE POLICY "Users can upload their own show card photos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'show_cards' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own show card photos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'show_cards' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own show card photos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'show_cards' AND
  auth.uid()::text = (storage.foldername(name))[1]
);