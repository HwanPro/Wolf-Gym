import { describe, expect, it } from "vitest";

import { buildSaleQuote } from "./sale-policy";

describe("sale policy", () => {
  const products = [
    { id: "water", name: "Agua", price: 3.5, discountPercent: 0, stock: 3 },
    { id: "protein", name: "Proteína", price: 10, discountPercent: 10, stock: 5 },
  ];

  it("groups repeated products before validating stock and totals", () => {
    const result = buildSaleQuote(products, [
      { productId: "protein", quantity: 2 },
      { productId: "protein", quantity: 1 },
    ]);

    expect(result).toEqual({
      ok: true,
      lines: [
        {
          productId: "protein",
          productName: "Proteína",
          quantity: 3,
          unitPrice: 9,
          lineTotal: 27,
        },
      ],
      totalItems: 3,
      grandTotal: 27,
    });
  });

  it("rejects invalid quantities, missing products, invalid discounts and insufficient stock", () => {
    expect(
      buildSaleQuote(products, [{ productId: "water", quantity: 0 }]),
    ).toMatchObject({ ok: false });
    expect(
      buildSaleQuote(products, [{ productId: "missing", quantity: 1 }]),
    ).toMatchObject({ ok: false });
    expect(
      buildSaleQuote(products, [{ productId: "water", quantity: 4 }]),
    ).toMatchObject({ ok: false });
    expect(
      buildSaleQuote(
        [{ ...products[0], discountPercent: 110 }],
        [{ productId: "water", quantity: 1 }],
      ),
    ).toMatchObject({ ok: false });
  });

  it("rounds monetary totals to two decimals", () => {
    expect(
      buildSaleQuote(
        [{ id: "x", name: "X", price: 1.005, discountPercent: 0, stock: 1 }],
        [{ productId: "x", quantity: 1 }],
      ),
    ).toMatchObject({ ok: true, grandTotal: 1.01 });
  });
});
