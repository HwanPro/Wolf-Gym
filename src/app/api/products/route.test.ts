import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import prisma from "@/infrastructure/prisma/prisma";
import { requestToken } from "@/server/auth/authorization";
import { POST } from "./route";
vi.mock("@/infrastructure/prisma/prisma", () => ({ default: { inventoryItem: { create: vi.fn() } } }));
vi.mock("@/server/auth/authorization", () => ({ requestToken: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestToken).mockResolvedValue({ id: "admin", role: "admin" });
  vi.mocked(prisma.inventoryItem.create).mockResolvedValue({ item_id: "product" } as never);
});
const request = (file?: File | string) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ item_name: "Test", item_description: "Test product", item_price: "10", item_stock: "1" })) data.set(key, value);
  if (file !== undefined) data.set("file", file);
  return new NextRequest("http://localhost/api/products", { method: "POST", body: data });
};
it("allows an absent image with the default picture", async () => {
  expect((await POST(request())).status).toBe(201);
  expect(vi.mocked(prisma.inventoryItem.create).mock.calls[0][0].data.item_image_url).toBe("/uploads/images/logo2.jpg");
});
it.each([new File([], "empty.jpg", { type: "image/jpeg" }), "not-a-file"])("rejects explicitly supplied invalid images without creating a product", async file => {
  expect((await POST(request(file))).status).toBe(400);
  expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
});
