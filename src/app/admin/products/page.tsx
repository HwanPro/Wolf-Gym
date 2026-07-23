"use client";

import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Image from "next/image";
import Link from "next/link";

import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "@/ui/dialog";

import AddProductDialog from "@/features/products/AddProductDialog";
import EditProductDialog from "@/features/products/EditProductDialog";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  discount: number;
  stock: number;
  imageUrl: string;
};

type NewProduct = Omit<Product, "id">;
const DEFAULT_PRODUCT_IMAGE = "/uploads/images/logo2.jpg";

const W = {
  black: "#0A0A0A",
  ink: "#141414",
  graph: "#1C1C1C",
  yellow: "#FFC21A",
  orange: "#FF7A1A",
  danger: "#E5484D",
  success: "#2EBD75",
  line: "rgba(255,194,26,0.15)",
  lineStrong: "rgba(255,194,26,0.35)",
  muted: "rgba(255,255,255,0.60)",
  faint: "rgba(255,255,255,0.40)",
  font: "'Inter', system-ui, sans-serif",
  display: "'Bebas Neue', 'Arial Narrow', sans-serif",
};

function getDiscountValue(discount?: number | string | null) {
  const value = Number(discount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/products");
      if (!response.ok) throw new Error("Error al obtener los productos");
      const data = await response.json();
      setProducts(
        data.map(
          (product: {
            item_id: string;
            item_name: string;
            item_description: string;
            item_price: number;
            item_discount?: number;
            item_stock: number;
            item_image_url?: string;
          }) => ({
            id: product.item_id,
            name: product.item_name,
            description: product.item_description,
            price: product.item_price,
            discount: product.item_discount || 0,
            stock: product.item_stock,
            imageUrl: product.item_image_url || DEFAULT_PRODUCT_IMAGE,
          }),
        ),
      );
    } catch (error) {
      console.error("Error al obtener los productos:", error);
      toast.error("Error al obtener los productos", {
        position: "top-center",
        style: { backgroundColor: "#FF0000", color: "#FFF" },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleAddSave = async (newProduct: NewProduct) => {
    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: newProduct.name,
        item_description: newProduct.description,
        item_price: newProduct.price,
        item_discount: newProduct.discount || 0,
        item_stock: newProduct.stock,
        item_image_url: newProduct.imageUrl,
      }),
    });
    if (!response.ok) throw new Error("Error al agregar el producto");
    try {
      toast.success("Producto agregado con éxito", {
        position: "top-right",
        style: { backgroundColor: "#00C853", color: "#FFF" },
      });
      await fetchProducts();
    } catch (error) {
      console.error("Error al agregar el producto:", error);
      toast.error("Error al agregar el producto", {
        position: "top-center",
        style: { backgroundColor: "#FF0000", color: "#FFF" },
      });
    }
  };

  const handleEditSave = async (updatedProduct: Product) => {
    setActionLoading(updatedProduct.id);
    try {
      const response = await fetch(`/api/products/${updatedProduct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: updatedProduct.name,
          item_description: updatedProduct.description,
          item_price: updatedProduct.price,
          item_discount: updatedProduct.discount || 0,
          item_stock: updatedProduct.stock,
        }),
      });
      if (!response.ok) throw new Error("Error al actualizar el producto");
      toast.success("Producto actualizado con éxito", {
        position: "top-right",
        style: { backgroundColor: "#00C853", color: "#FFF" },
      });
      await fetchProducts();
      setSelectedProduct(null);
    } catch (error) {
      console.error("Error al actualizar el producto:", error);
      toast.error("Error al actualizar el producto", {
        position: "top-center",
        style: { backgroundColor: "#FF0000", color: "#FFF" },
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    const confirm = window.confirm(
      "¿Estás seguro de que deseas eliminar este producto?",
    );
    if (!confirm) return;
    setActionLoading(id);
    try {
      const response = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Error al eliminar el producto");
      toast.success("Producto eliminado con éxito", {
        position: "top-right",
        style: { backgroundColor: "#00C853", color: "#FFF" },
      });
      await fetchProducts();
    } catch (error) {
      console.error("Error al eliminar el producto:", error);
      toast.error("Error al eliminar el producto", {
        position: "top-center",
        style: { backgroundColor: "#FF0000", color: "#FFF" },
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: W.black,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
        <p
          style={{
            fontFamily: W.display,
            fontSize: 28,
            color: W.yellow,
            letterSpacing: "0.06em",
          }}
        >
          Cargando productos...
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: W.black,
        color: "#fff",
        fontFamily: W.font,
        padding: 24,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <div style={{ maxWidth: 1400, margin: "0 auto 28px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
            paddingBottom: 20,
            borderBottom: `1px solid ${W.line}`,
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: W.yellow,
                margin: "0 0 6px",
              }}
            >
              Administración
            </p>
            <h1
              style={{
                fontFamily: W.display,
                fontSize: 32,
                color: "#fff",
                margin: 0,
                letterSpacing: "0.04em",
              }}
            >
              Gestión de Productos
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  style={{
                    height: 40,
                    background: W.yellow,
                    border: `1px solid ${W.yellow}`,
                    borderRadius: 10,
                    color: W.black,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: "0 16px",
                  }}
                >
                  + Agregar Producto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/10 bg-zinc-950 text-white">
                <DialogTitle className="sr-only">Agregar producto</DialogTitle>
                <AddProductDialog
                  onSave={handleAddSave}
                  onClose={() => console.log("Modal cerrado")}
                />
              </DialogContent>
            </Dialog>
            <Link
              href="/admin/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "0 16px",
                height: 40,
                background: "transparent",
                border: `1px solid ${W.lineStrong}`,
                borderRadius: 10,
                color: W.muted,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              ← Dashboard
            </Link>
          </div>
        </div>

        {/* Product grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 20,
          }}
        >
          {products.map((product) => {
            const isLowStock = product.stock <= 10;
            return (
              <div
                key={product.id}
                style={{
                  background: W.ink,
                  border: isLowStock
                    ? `1px solid ${W.orange}`
                    : `1px solid ${W.line}`,
                  borderRadius: 14,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  textAlign: "center",
                  position: "relative",
                  transition: "border-color 0.15s",
                }}
              >
                {isLowStock && (
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      background: "rgba(255,122,26,0.15)",
                      border: `1px solid ${W.orange}`,
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: W.orange,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Stock bajo
                  </div>
                )}
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 10,
                    overflow: "hidden",
                    background: W.graph,
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Image
                    src={product.imageUrl || DEFAULT_PRODUCT_IMAGE}
                    alt={product.name || "Producto"}
                    width={96}
                    height={96}
                    style={{
                      objectFit: "contain",
                      width: "100%",
                      height: "100%",
                    }}
                  />
                </div>
                <h2
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#fff",
                    margin: "0 0 6px",
                  }}
                >
                  {product.name || "Sin nombre"}
                </h2>
                <p
                  style={{
                    fontSize: 12,
                    color: W.faint,
                    margin: "0 0 10px",
                    lineHeight: 1.5,
                  }}
                >
                  {product.description || "Sin descripción"}
                </p>
                <p
                  style={{
                    fontFamily: W.display,
                    fontSize: 28,
                    color: W.yellow,
                    margin: "0 0 4px",
                    letterSpacing: "0.02em",
                  }}
                >
                  S/. {(product.price ?? 0).toFixed(2)}
                </p>
                {getDiscountValue(product.discount) > 0 && (
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: W.orange,
                      margin: "0 0 6px",
                    }}
                  >
                    Descuento: {getDiscountValue(product.discount)}%
                  </p>
                )}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 16,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: W.faint,
                    }}
                  >
                    Stock:
                  </span>
                  <span
                    style={{
                      fontFamily: W.display,
                      fontSize: 20,
                      color: isLowStock ? W.orange : "#fff",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {product.stock ?? "Sin stock"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, width: "100%" }}>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        onClick={() => setSelectedProduct(product)}
                        style={{
                          flex: 1,
                          height: 36,
                          background: W.yellow,
                          border: `1px solid ${W.yellow}`,
                          borderRadius: 8,
                          color: W.black,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Editar
                      </Button>
                    </DialogTrigger>
                    {selectedProduct?.id === product.id && (
                      <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/10 bg-zinc-950 text-white">
                        <DialogTitle
                          style={{ color: W.yellow, textAlign: "center" }}
                        >
                          Editar Producto
                        </DialogTitle>
                        <EditProductDialog
                          product={selectedProduct}
                          onSave={handleEditSave}
                          onClose={() => setSelectedProduct(null)}
                        />
                      </DialogContent>
                    )}
                  </Dialog>
                  <Button
                    onClick={() => handleDelete(product.id)}
                    disabled={actionLoading === product.id}
                    style={{
                      flex: 1,
                      height: 36,
                      background:
                        actionLoading === product.id
                          ? "rgba(229,72,77,0.5)"
                          : W.danger,
                      border: `1px solid ${W.danger}`,
                      borderRadius: 8,
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor:
                        actionLoading === product.id
                          ? "not-allowed"
                          : "pointer",
                      opacity: actionLoading === product.id ? 0.6 : 1,
                    }}
                  >
                    {actionLoading === product.id
                      ? "Eliminando..."
                      : "Eliminar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
