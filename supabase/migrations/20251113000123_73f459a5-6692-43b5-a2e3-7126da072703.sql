-- Add UPDATE policy for cash_transactions to allow users to update their own records
CREATE POLICY "Users can update own cash transactions" 
ON public.cash_transactions 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);