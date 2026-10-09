CREATE TABLE "security_rate_limit_window" (
    "key_hash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL CHECK ("attempts" > 0),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "security_rate_limit_window_pkey" PRIMARY KEY ("key_hash")
);

CREATE INDEX "security_rate_limit_window_expires_at_idx"
    ON "security_rate_limit_window"("expires_at");
