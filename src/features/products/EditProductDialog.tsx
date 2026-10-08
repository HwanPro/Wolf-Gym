import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  discount: number;
  stock: number;
  imageUrl: string;
  category?: string;
  sku?: string | null;
  trackStock?: boolean;
  updatedAt?: string;
};

function EditProductDialog({
  product,
  onSave,
  onClose,
}: {
  product: Product;
  onSave: (updatedProduct: Product, imageFile?: File) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState<string>(product.name);
  const [description, setDescription] = useState<string>(product.description);
  const [price, setPrice] = useState<string>(product.price.toString());
  const [discount, setDiscount] = useState<string>(product.discount.toString());
  const [stock, setStock] = useState<string>(product.stock.toString());
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(product.category ?? "general");
  const [sku, setSku] = useState(product.sku ?? "");
  const [trackStock, setTrackStock] = useState(product.trackStock ?? true);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState<File | undefined>();

  useEffect(() => {
    setName(product.name);
    setDescription(product.description);
    setPrice(product.price.toString());
    setDiscount(product.discount.toString());
    setStock(product.stock.toString());
    setCategory(product.category ?? "general"); setSku(product.sku ?? ""); setTrackStock(product.trackStock ?? true);
    setImageFile(undefined);
  }, [product]);

  const handleSave = async () => {
    if (saving.current) return;
    setError(null);

    if (!name || !description) {
      setError("El nombre y la descripción son obligatorios.");
      return;
    }

    const parsedPrice = price.trim() ? Number(price) : NaN;
    const parsedDiscount = discount.trim() ? Number(discount) : 0;
    const parsedStock = stock.trim() ? Number(stock) : NaN;

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError("El precio debe ser un número válido y mayor o igual a 0.");
      return;
    }

    if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
      setError("El descuento debe ser un número entre 0 y 100.");
      return;
    }

    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      setError("El stock debe ser un número válido y mayor o igual a 0.");
      return;
    }

    const updatedProduct: Product = {
      ...product,
      name: name.trim(),
      description: description.trim(),
      price: parsedPrice,
      discount: parsedDiscount,
      stock: parsedStock,
      category, sku, trackStock,
    };

    try {
      saving.current = true; setBusy(true);
      await onSave(updatedProduct, imageFile);
      onClose();
    } catch (err: unknown) {
      console.error("Error al guardar los cambios:", err);
      setError(
        err instanceof Error ? err.message : "Error al actualizar el producto.",
      );
    } finally {
      saving.current = false; setBusy(false);
    }
  };

  return (
    <div>
      <div className="wolf-product-theme mx-auto w-full max-w-md rounded-lg border border-white/10 bg-zinc-950 p-6 text-zinc-100 shadow-lg">
        <h2 className="text-lg font-bold text-center text-black mb-4">
          Editar Producto
        </h2>
        {error && (
          <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
        )}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="wolf-control mb-4 px-3"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="wolf-control mb-4 px-3"
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="wolf-control mb-4 px-3"
        />
        <input
          type="number"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          className="wolf-control mb-4 px-3"
        />
        <input
          type="number"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="wolf-control mb-4 px-3"
        />
        <label className="block mb-3">Categoría<input value={category} required maxLength={80} onChange={event => setCategory(event.target.value)} className="wolf-control px-3" /></label>
        <label className="block mb-3">SKU / código<input value={sku} maxLength={80} onChange={event => setSku(event.target.value)} className="wolf-control px-3" /></label>
        <label className="flex items-center gap-2 mb-4"><input type="checkbox" checked={trackStock} onChange={event => setTrackStock(event.target.checked)} />Controlar stock</label>
        <label className="block mb-4">Cambiar foto
          <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Cambiar foto del producto" disabled={busy}
            onChange={event => {
              const file = event.target.files?.[0];
              if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0)) {
                setError("Use una imagen JPG, PNG o WebP de hasta 5 MB.");
                setImageFile(undefined); event.target.value = ""; return;
              }
              setError(null); setImageFile(file);
            }} className="wolf-control py-2" />
        </label>
        <div className="flex gap-4">
          <Button
            className="bg-yellow-400 text-black py-2 rounded hover:bg-yellow-500 w-full"
            onClick={handleSave}
            disabled={busy}
          >
            Guardar Cambios
          </Button>
          <Button
            className="bg-red-500 text-white py-2 rounded hover:bg-red-600 w-full"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EditProductDialog;
