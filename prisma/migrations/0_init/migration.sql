-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "warehouseId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Zone_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rack" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "zoneId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Rack_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Location" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rackId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "fullPath" TEXT NOT NULL,
    CONSTRAINT "Location_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" REAL NOT NULL,
    "reorderPoint" REAL NOT NULL,
    "dailyUsage" REAL NOT NULL,
    "safetyStock" REAL NOT NULL,
    "valueClass" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "reliability" REAL NOT NULL DEFAULT 0.95,
    "damageRate" REAL NOT NULL DEFAULT 0.01,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "ProductSupplier" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "costPrice" REAL NOT NULL,
    "minOrderQty" REAL NOT NULL DEFAULT 0,
    "orderMultiple" REAL NOT NULL DEFAULT 1,
    CONSTRAINT "ProductSupplier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "onHand" REAL NOT NULL DEFAULT 0,
    "reserved" REAL NOT NULL DEFAULT 0,
    "incoming" REAL NOT NULL DEFAULT 0,
    "inTransit" REAL NOT NULL DEFAULT 0,
    "damaged" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockLevel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockLevel_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "supplierId" INTEGER,
    "warehouseId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "expectedAt" DATETIME NOT NULL,
    "receivedAt" DATETIME,
    "note" TEXT,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Receipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "receiptId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "expectedQty" REAL NOT NULL,
    "receivedQty" REAL,
    CONSTRAINT "ReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReceiptLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReceiptLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedAt" DATETIME,
    "packedAt" DATETIME,
    "deliveredAt" DATETIME
);

-- CreateTable
CREATE TABLE "DeliveryLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "qty" REAL NOT NULL,
    "pickedQty" REAL,
    CONSTRAINT "DeliveryLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DeliveryOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fromLocationId" INTEGER NOT NULL,
    "toLocationId" INTEGER NOT NULL,
    "note" TEXT,
    "createdBy" INTEGER,
    "shippedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" DATETIME,
    CONSTRAINT "Transfer_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transfer_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransferLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transferId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "qty" REAL NOT NULL,
    CONSTRAINT "TransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransferLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Adjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" INTEGER,
    "approvedBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AdjustmentLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "adjustmentId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "systemQty" REAL NOT NULL,
    "countedQty" REAL NOT NULL,
    "delta" REAL NOT NULL,
    CONSTRAINT "AdjustmentLine_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "Adjustment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdjustmentLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AdjustmentLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "docCode" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "prevQty" REAL NOT NULL,
    "newQty" REAL NOT NULL,
    "diff" REAL NOT NULL,
    "reason" TEXT,
    "performedBy" INTEGER,
    "approvedBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CycleCount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "locationId" INTEGER,
    "productId" INTEGER,
    "dueDate" DATETIME NOT NULL,
    "cadence" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "completedBy" INTEGER,
    CONSTRAINT "CycleCount_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CycleCount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CycleCountLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "countId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "systemQty" REAL NOT NULL,
    "countedQty" REAL,
    "variance" REAL,
    CONSTRAINT "CycleCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "CycleCount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CycleCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReorderSuggestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "suggestedQty" REAL NOT NULL,
    "preferredName" TEXT NOT NULL,
    "preferredLeadDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decidedBy" INTEGER,
    "decidedAt" DATETIME,
    "receiptCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReorderSuggestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExceptionFlag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" INTEGER,
    "refCode" TEXT,
    "status" TEXT NOT NULL,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" INTEGER,
    "reviewedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_warehouseId_code_key" ON "Zone"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Rack_zoneId_code_key" ON "Rack"("zoneId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSupplier_productId_supplierId_key" ON "ProductSupplier"("productId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_productId_locationId_key" ON "StockLevel"("productId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_code_key" ON "Receipt"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_code_key" ON "DeliveryOrder"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_code_key" ON "Transfer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Adjustment_code_key" ON "Adjustment"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_code_key" ON "LedgerEntry"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CycleCount_code_key" ON "CycleCount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ReorderSuggestion_productId_key" ON "ReorderSuggestion"("productId");
