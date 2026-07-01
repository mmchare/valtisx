
CREATE POLICY "kyc own upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "kyc own read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'kyc-documents' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "kyc own update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
