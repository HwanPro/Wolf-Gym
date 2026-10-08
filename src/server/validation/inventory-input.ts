import { z } from "zod";

const numberInput = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== "" ? Number(value) : value,
    schema.finite(),
  );

export const inventoryInput = z.object({
  item_name: z.string().trim().min(1).max(120),
  item_description: z.string().trim().min(1).max(2000),
  item_price: numberInput(z.number().min(0).max(999999.99)).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, "Use como máximo dos decimales"),
  item_discount: numberInput(z.number().min(0).max(100)).default(0),
  item_stock: numberInput(z.number().int().min(0).max(1000000)),
  item_category: z.string().trim().min(1).max(80).optional(),
  item_sku: z.string().trim().max(80).nullable().optional(),
  track_stock: z.preprocess(value => value === "false" ? false : value === "true" ? true : value, z.boolean()).optional(),
});
