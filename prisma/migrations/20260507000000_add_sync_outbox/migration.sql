-- Outbox table for offline-first desktop → remote replication.
-- Empty in web/Vercel mode; populated only by the desktop runtime.

CREATE TABLE "sync_outbox" (
  "id" TEXT NOT NULL,
  "sync_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "synced_at" TIMESTAMP(3),
  CONSTRAINT "sync_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_outbox_sync_id_key" ON "sync_outbox"("sync_id");
CREATE INDEX "sync_outbox_status_created_at_idx" ON "sync_outbox"("status", "created_at");
CREATE INDEX "sync_outbox_entity_type_entity_id_idx" ON "sync_outbox"("entity_type", "entity_id");
