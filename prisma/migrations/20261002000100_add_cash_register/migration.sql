-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "item_sku" TEXT,
ADD COLUMN     "track_stock" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PaymentRecord" ADD COLUMN     "cashSaleId" TEXT,
ADD COLUMN     "tenderMethod" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "cashSaleId" TEXT;

-- AlterTable
ALTER TABLE "daily_debts" ADD COLUMN     "cashSaleId" TEXT,
ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "debt_history" ADD COLUMN     "cashSaleId" TEXT,
ADD COLUMN     "productId" TEXT;

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "registerId" TEXT NOT NULL DEFAULT 'main',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedBy" TEXT NOT NULL,
    "closedBy" TEXT,
    "openingCents" INTEGER NOT NULL,
    "expectedCents" INTEGER,
    "countedCents" INTEGER,
    "differenceCents" INTEGER,
    "openingNote" TEXT NOT NULL DEFAULT '',
    "closingNote" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sales" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL,
    "dueCents" INTEGER NOT NULL,
    "tenderedCents" INTEGER NOT NULL DEFAULT 0,
    "changeCents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "cash_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sale_lines" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "stockTracked" BOOLEAN NOT NULL,

    CONSTRAINT "cash_sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "saleId" TEXT,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_actions" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_sessions_registerId_status_idx" ON "cash_sessions"("registerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sales_number_key" ON "cash_sales"("number");

-- CreateIndex
CREATE INDEX "cash_sales_createdAt_status_idx" ON "cash_sales"("createdAt", "status");

-- CreateIndex
CREATE INDEX "cash_sales_customerId_idx" ON "cash_sales"("customerId");

-- CreateIndex
CREATE INDEX "cash_sale_lines_saleId_idx" ON "cash_sale_lines"("saleId");

-- CreateIndex
CREATE INDEX "cash_movements_sessionId_createdAt_idx" ON "cash_movements"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cash_actions_requestKey_key" ON "cash_actions"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_item_sku_key" ON "InventoryItem"("item_sku");

-- CreateIndex
CREATE UNIQUE INDEX "daily_debts_cashSaleId_key" ON "daily_debts"("cashSaleId");

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_cashSaleId_fkey" FOREIGN KEY ("cashSaleId") REFERENCES "cash_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_cashSaleId_fkey" FOREIGN KEY ("cashSaleId") REFERENCES "cash_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_debts" ADD CONSTRAINT "daily_debts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryItem"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_debts" ADD CONSTRAINT "daily_debts_cashSaleId_fkey" FOREIGN KEY ("cashSaleId") REFERENCES "cash_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sales" ADD CONSTRAINT "cash_sales_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sales" ADD CONSTRAINT "cash_sales_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sales" ADD CONSTRAINT "cash_sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sale_lines" ADD CONSTRAINT "cash_sale_lines_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "cash_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sale_lines" ADD CONSTRAINT "cash_sale_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryItem"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "cash_sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX cash_sessions_one_open_register ON cash_sessions("registerId") WHERE status = 'OPEN';
ALTER TABLE cash_sessions ADD CONSTRAINT cash_session_amounts CHECK ("openingCents" >= 0 AND ("countedCents" IS NULL OR "countedCents" >= 0) AND status IN ('OPEN','CLOSED'));
ALTER TABLE cash_sales ADD CONSTRAINT cash_sale_amounts CHECK ("totalCents" >= 0 AND "paidCents" >= 0 AND "dueCents" >= 0 AND (status = 'VOIDED' OR "paidCents" + "dueCents" = "totalCents"));
ALTER TABLE cash_sale_lines ADD CONSTRAINT cash_line_amounts CHECK (quantity > 0 AND "unitCents" >= 0 AND "totalCents" >= 0);
