-- Per-user game progress. Safe to run more than once.
CREATE TABLE IF NOT EXISTS "GameSave" (
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameSave_pkey" PRIMARY KEY ("userId")
);

DO $$ BEGIN
  ALTER TABLE "GameSave" ADD CONSTRAINT "GameSave_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The API connects as the table owner; this keeps the public Supabase REST endpoint closed.
ALTER TABLE "GameSave" ENABLE ROW LEVEL SECURITY;
