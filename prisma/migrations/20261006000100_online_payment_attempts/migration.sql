CREATE TABLE "OnlinePaymentAttempt" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "gatewayMode" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'RESERVED',
  "amountCents" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "paymentId" INTEGER NOT NULL,
  "chargeId" TEXT,
  "authenticationHash" TEXT,
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnlinePaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OnlinePaymentAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentRecord"("payment_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OnlinePaymentAttempt_sourceHash_key" ON "OnlinePaymentAttempt"("sourceHash");
CREATE UNIQUE INDEX "OnlinePaymentAttempt_paymentId_key" ON "OnlinePaymentAttempt"("paymentId");
CREATE UNIQUE INDEX "OnlinePaymentAttempt_chargeId_key" ON "OnlinePaymentAttempt"("chargeId");
CREATE INDEX "OnlinePaymentAttempt_userId_createdAt_idx" ON "OnlinePaymentAttempt"("userId", "createdAt");
CREATE INDEX "OnlinePaymentAttempt_state_createdAt_idx" ON "OnlinePaymentAttempt"("state", "createdAt");
