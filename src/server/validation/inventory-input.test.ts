import { expect, it } from "vitest";
import { inventoryInput } from "./inventory-input";
it("accepts explicit service metadata and rejects malformed numeric values", () => {
  const base = { item_name: "Servicio", item_description: "Descripción", item_price: "10", item_stock: "0" };
  expect(inventoryInput.parse({ ...base, track_stock: "false", item_sku: "S-1" })).toMatchObject({ item_price: 10, track_stock: false, item_sku: "S-1" });
  expect(inventoryInput.parse({ ...base, track_stock: "true" }).track_stock).toBe(true);
  expect(inventoryInput.parse({ ...base, track_stock: true }).track_stock).toBe(true);
  expect(inventoryInput.safeParse({ ...base, item_price: "10;DROP" }).success).toBe(false);
  expect(inventoryInput.safeParse({ ...base, item_price: "" }).success).toBe(false);
  expect(inventoryInput.safeParse({ ...base, item_price: "10.001" }).success).toBe(false);
  expect(inventoryInput.safeParse({ ...base, item_price: "10.29" }).success).toBe(true);
  expect(inventoryInput.safeParse({ ...base, item_stock: 0.5 }).success).toBe(false);
});
