// @vitest-environment jsdom
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicProductList from "./page";

const { openCheckout } = vi.hoisted(() => ({ openCheckout: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/ui/components/SafeImage", () => ({ default: () => null }));
vi.mock("react-toastify", () => ({
  ToastContainer: () => null,
  toast: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/features/payments/useCulqiPayment", () => ({
  useCulqiPayment: () => ({ config: {}, processing: false, openCheckout }),
}));

let container: HTMLDivElement;
let root: Root;
function button(name: string, index = 0) {
  const matches = [...container.querySelectorAll("button")].filter(element =>
    (element.getAttribute("aria-label") || element.textContent?.trim()) === name);
  if (!matches[index]) throw new Error(`Botón no encontrado: ${name}`);
  return matches[index];
}
async function click(name: string, index = 0) {
  await act(async () => { button(name, index).click(); });
}
async function renderPage() {
  await act(async () => { root.render(<PublicProductList />); });
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  openCheckout.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [
    { item_id: "protein", item_name: "Proteína", item_price: 10, item_discount: 10, item_stock: 3 },
    { item_id: "water", item_name: "Agua", item_price: 2.5, item_stock: 10 },
  ] }));
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("selección de productos", () => {
  it("reinicia la cantidad al cancelar y elegir otro producto", async () => {
    await renderPage();
    await click("Seleccionar Opciones");
    await click("+");
    await click("Cerrar opciones");
    await click("Seleccionar Opciones", 1);
    await click("Agregar al carrito");
    await click("Abrir carrito");
    expect(container).toHaveTextContent("Cantidad: 1 x S/.2.50");
  });

  it("mantiene el carrito al cerrar y reabrir y no excede el stock acumulado", async () => {
    await renderPage();
    await click("Seleccionar Opciones");
    await click("+");
    await click("Agregar al carrito");
    await click("Seleccionar Opciones");
    await click("+");
    await click("Agregar al carrito");
    await click("Abrir carrito");
    expect(container).toHaveTextContent("Cantidad: 2 x S/.9.00");
    await click("Cerrar carrito");
    await click("Abrir carrito");
    expect(container).toHaveTextContent("Total a pagar: S/. 18.00");
    await click("Pagar Carrito");
    expect(openCheckout).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ productId: "protein", quantity: 2 }],
    }));
  });
});
