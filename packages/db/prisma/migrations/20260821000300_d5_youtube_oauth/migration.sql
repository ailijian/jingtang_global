ALTER TABLE "channels"
  ADD COLUMN "token_envelope_ciphertext" TEXT,
  ADD COLUMN "authorized_at" TIMESTAMPTZ(3),
  ADD COLUMN "refreshed_at" TIMESTAMPTZ(3);

ALTER TABLE "channels"
  ADD CONSTRAINT "channels_consent_record_id_fkey"
  FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
