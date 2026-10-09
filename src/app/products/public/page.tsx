"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FaShoppingCart, FaSearch } from "react-icons/fa";
import Image from "@/ui/components/SafeImage";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useCulqiPayment } from "@/features/payments/useCulqiPayment";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  discount?: number;
  stock: number;
  trackStock: boolean;
  imageUrl: string;
  quantity?: number;
};
const DEFAULT_PRODUCT_IMAGE = "/uploads/images/logo2.jpg";

function getDiscountValue(discount?: number | string | null) {
  const value = Number(discount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getDiscountedPrice(product: Product) {
  const discount = getDiscountValue(product.discount);
  return Math.round(product.price * (1 - discount / 100) * 100) / 100;
}

export default function PublicProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [showCart, setShowCart] = useState(false);
  const payment = useCulqiPayment();
  const isProcessingPayment = payment.processing;
  const [paymentEmail, setPaymentEmail] = useState("");
  const router = useRouter();

  // 2. Cargar lista de productos
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/api/products/public");
        if (!response.ok) {
          throw new Error("Error al cargar productos");
        }
        const data = await response.json();
        const formatted = data.map(
          (p: {
            item_id: string;
            item_name: string;
            item_description: string;
            item_price: number;
            item_discount?: number;
            item_stock?: number;
            track_stock?: boolean;
            item_image_url?: string;
          }) => ({
            id: p.item_id,
            name: p.item_name,
            description: p.item_description,
            price: p.item_price,
            discount: p.item_discount || 0,
            stock: p.item_stock || 0,
            trackStock: p.track_stock !== false,
            imageUrl: p.item_image_url || DEFAULT_PRODUCT_IMAGE,
          })
        );
        setProducts(formatted);
        setCart(current => current.flatMap(row => {
          const product = formatted.find((item: Product) => item.id === row.id);
          return product ? [{ ...product, quantity: row.quantity }] : [];
        }));
      } catch (error) {
        console.error("Error al cargar productos:", error);
        toast.error("❌ Error al cargar productos. Intenta nuevamente.");
      }
    };
    void fetchProducts();
    const timer = setInterval(() => { void fetchProducts(); }, 30000);
    const onFocus = () => { void fetchProducts(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  // 3. Filtro
  useEffect(() => {
    const results = products.filter((prod) =>
      prod.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredProducts(results);
  }, [searchTerm, products]);

  // Añadir al carrito
  const handleAddToCart = (product: Product) => {
    if (product.trackStock && quantity > product.stock) {
      toast.warn("⚠️ No hay suficiente stock disponible.");
      return;
    }
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      const newQty = (existing.quantity || 1) + quantity;
      if (product.trackStock && newQty > product.stock) {
        toast.warn("⚠️ No puedes agregar más de lo disponible.");
        return;
      }
      setCart((prev) =>
        prev.map((it) =>
          it.id === product.id ? { ...it, quantity: newQty } : it
        )
      );
    } else {
      setCart([...cart, { ...product, quantity }]);
    }
    setSelectedProduct(null);
    setQuantity(1);
  };

  const handleRemoveFromCart = (id: string) => {
    setCart((prev) => prev.filter((it) => it.id !== id));
    toast.info("🗑 Producto eliminado del carrito.");
  };

  const pagarCompra = async () => {
    if (cart.length === 0) { toast.error("El carrito está vacío."); return; }
    await payment.openCheckout({
      email: paymentEmail.trim(),
      items: cart.map(item => ({ productId: item.id, quantity: item.quantity || 1 })),
      onConfirmed: () => { setCart([]); setShowCart(false); toast.success("Pago confirmado."); },
    });
  };

  return (
    <div className="bg-white min-h-screen text-black">
      {payment.config.mode === "test" && <p className="bg-yellow-100 p-2 text-center font-bold text-black">Modo de prueba · usa únicamente tarjetas de prueba</p>}
      {payment.message && <div role="status" className="border border-yellow-400 bg-yellow-50 p-3 text-black">
        {payment.message}
        {payment.hasPendingAttempt && <button type="button" className="ml-3 underline" disabled={payment.processing} onClick={payment.checkStatus}>Consultar estado del pago</button>}
        {payment.attempt && ["RESERVED", "REQUIRES_3DS"].includes(payment.attempt.state) && <button type="button" className="ml-3 underline" disabled={payment.processing} onClick={payment.cancelAuthentication}>Cancelar intento y liberar reserva</button>}
      </div>}
      <header className="flex flex-wrap items-center justify-between p-4 border-b bg-white shadow-md">
        <h1 className="text-xl font-bold text-black flex-1">
          Nuestros Productos
        </h1>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative w-full sm:w-auto">
            <FaSearch className="absolute top-1/2 left-3 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Buscar productos"
              className="w-full min-w-0 pl-10 pr-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <button
            onClick={() => router.push("/")}
            className="bg-yellow-400 text-black px-4 py-2 rounded-full hover:bg-yellow-500"
          >
            Volver al Inicio
          </button>
          <button
            role="button"
            aria-label="Abrir carrito"
            className="relative text-2xl text-black ml-auto"
            onClick={() => setShowCart(!showCart)}
          >
            <FaShoppingCart />
            {cart.length > 0 && (
              <span className="absolute top-0 right-0 bg-yellow-400 text-black text-xs font-bold rounded-full px-2 py-1">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* LISTADO DE PRODUCTOS */}
      <main className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredProducts.map((prod) => (
            <div
              key={prod.id}
              className="relative bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center transition-transform hover:scale-105"
            >
              {getDiscountValue(prod.discount) > 0 && (
                <div className="absolute top-2 left-2 rounded bg-orange-500 px-2 py-1 text-xs font-bold text-black">
                  {getDiscountValue(prod.discount)}% OFF
                </div>
              )}
              {prod.trackStock && prod.stock === 0 && (
                <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 font-bold rounded">
                  Agotado
                </div>
              )}
              <Image
                src={prod.imageUrl}
                alt={prod.name}
                className="h-32 w-full object-contain mx-auto mb-4"
                width={128}
                height={128}
              />
              <h2 className="text-lg font-bold text-black">{prod.name}</h2>
              <p className="text-sm text-black">{prod.description}</p>
              <p className="text-lg font-extrabold text-yellow-600">
                S/. {getDiscountedPrice(prod).toFixed(2)}
              </p>
              {!prod.trackStock || prod.stock > 0 ? (
                <button
                  onClick={() => { setQuantity(1); setSelectedProduct(prod); }}
                  className="mt-4 bg-yellow-400 text-black px-4 py-2 rounded-full hover:bg-yellow-500"
                >
                  Seleccionar Opciones
                </button>
              ) : (
                <button
                  disabled
                  className="mt-4 bg-gray-400 text-black px-4 py-2 rounded-full cursor-not-allowed"
                >
                  Agotado
                </button>
              )}
              {selectedProduct?.id === prod.id && (
                <div className="absolute inset-0 bg-white bg-opacity-90 flex flex-col justify-center items-center rounded-lg shadow-lg text-black p-4">
                  <button
                    aria-label="Cerrar opciones"
                    onClick={() => setSelectedProduct(null)}
                    className="absolute top-2 right-2 text-black font-bold"
                  >
                    X
                  </button>
                  <p className="text-sm text-black mb-2">Cantidad:</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="px-2 py-1 border rounded"
                    >
                      -
                    </button>
                    <span>{quantity}</span>
                    <button
                      onClick={() => setQuantity((q) => q + 1)}
                      className="px-2 py-1 border rounded"
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="mt-4 bg-yellow-400 text-black px-4 py-2 rounded-full hover:bg-yellow-500"
                    onClick={() => handleAddToCart(prod)}
                  >
                    Agregar al carrito
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* CARRITO */}
      {showCart && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-end"
          onClick={() => setShowCart(false)}
        >
          <div
            className="bg-white text-black w-full sm:w-80 h-full overflow-y-auto overscroll-contain shadow-lg p-4 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCart(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-black font-bold"
              aria-label="Cerrar carrito"
            >
              X
            </button>

            <h2 className="text-lg font-bold mb-4 text-black text-center">
              Carrito
            </h2>
            {cart.length > 0 ? (
              <div>
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center mb-4 border-b pb-2"
                  >
                    <div className="min-w-0 break-words pr-2">
                      <p className="text-sm font-bold">{item.name}</p>
                      <p className="text-sm">
                        Cantidad: {item.quantity} x S/.{getDiscountedPrice(item).toFixed(2)}
                      </p>
                      <p className="text-sm font-bold">
                        Subtotal: S/.{" "}
                        {((item.quantity || 1) * getDiscountedPrice(item)).toFixed(2)}
                      </p>
                    </div>
                    <button
                      aria-label={`Quitar ${item.name} del carrito`}
                      onClick={() => handleRemoveFromCart(item.id)}
                      className="text-red-600 font-bold"
                    >
                      X
                    </button>
                  </div>
                ))}
                <hr className="my-4" />
                <div className="text-right">
                  <label className="mb-1 block text-left text-sm font-semibold text-black" htmlFor="payment-email">
                    Correo para el comprobante
                  </label>
                  <input
                    id="payment-email"
                    type="email"
                    value={paymentEmail}
                    onChange={(event) => setPaymentEmail(event.target.value)}
                    autoComplete="email"
                    className="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-black"
                    placeholder="cliente@correo.com"
                  />
                  <p className="text-lg font-bold">
                    Total a pagar: S/.{" "}
                    {cart
                      .reduce(
                        (acc, item) =>
                          acc + (item.quantity || 1) * getDiscountedPrice(item),
                        0,
                      )
                      .toFixed(2)}
                  </p>
                  <button
                    onClick={pagarCompra}
                    className="w-full bg-yellow-400 mt-4 text-black hover:bg-yellow-500 py-2 rounded"
                    disabled={isProcessingPayment}
                  >
                    {isProcessingPayment ? "Procesando..." : "Pagar Carrito"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-600">
                El carrito está vacío.
              </p>
            )}
          </div>
        </div>
      )}
      <ToastContainer />
    </div>
  );
}
