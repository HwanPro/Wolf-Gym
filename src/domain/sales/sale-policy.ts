export type SaleProduct = {
  id: string;
  name: string;
  price: number;
  discountPercent?: number | null;
  stock: number;
};

export type SaleItemInput = {
  productId: string;
  quantity: number;
};

export type SaleLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type SaleQuote =
  | {
      ok: true;
      lines: SaleLine[];
      totalItems: number;
      grandTotal: number;
    }
  | { ok: false; issues: string[] };

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildSaleQuote(
  products: readonly SaleProduct[],
  input: readonly SaleItemInput[],
): SaleQuote {
  const issues: string[] = [];
  const quantities = new Map<string, number>();

  for (const item of input) {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      issues.push("Cada producto debe tener una cantidad entera mayor que cero");
      continue;
    }
    quantities.set(
      item.productId,
      (quantities.get(item.productId) ?? 0) + item.quantity,
    );
  }

  if (quantities.size === 0 && issues.length === 0) {
    issues.push("Debe enviar al menos un producto");
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const lines: SaleLine[] = [];

  for (const [productId, quantity] of quantities) {
    const product = productById.get(productId);
    if (!product) {
      issues.push(`Producto no encontrado: ${productId}`);
      continue;
    }

    const discount = product.discountPercent ?? 0;
    if (
      !Number.isFinite(product.price) ||
      product.price < 0 ||
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > 100 ||
      !Number.isInteger(product.stock) ||
      product.stock < 0
    ) {
      issues.push(`${product.name}: precio, descuento o stock inválido`);
      continue;
    }
    if (product.stock < quantity) {
      issues.push(
        `${product.name}: stock insuficiente (stock ${product.stock}, solicitado ${quantity})`,
      );
      continue;
    }

    const unitPrice = money(product.price * (1 - discount / 100));
    lines.push({
      productId,
      productName: product.name,
      quantity,
      unitPrice,
      lineTotal: money(unitPrice * quantity),
    });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    lines,
    totalItems: lines.reduce((sum, line) => sum + line.quantity, 0),
    grandTotal: money(lines.reduce((sum, line) => sum + line.lineTotal, 0)),
  };
}
