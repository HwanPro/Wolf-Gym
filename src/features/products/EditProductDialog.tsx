import { useEffect, useState } from "react";
import { Button } from "@/ui/button";

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  discount: number;
  stock: number;
  imageUrl: string;
};

function EditProductDialog({
  product,
  onSave,
  onClose,
}: {
  product: Product;
  onSave: (updatedProduct: Product) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState<string>(product.name);
  const [description, setDescription] = useState<string>(product.description);
  const [price, setPrice] = useState<string>(product.price.toString());
  const [discount, setDiscount] = useState<string>(product.discount.toString());
  const [stock, setStock] = useState<string>(product.stock.toString());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(product.name);
    setDescription(product.description);
    setPrice(product.price.toString());
    setDiscount(product.discount.toString());
    setStock(product.stock.toString());
  }, [product]);

  const handleSave = async () => {
    setError(null);

    if (!name || !description) {
      setError("El nombre y la descripción son obligatorios.");
      return;
    }

    const parsedPrice = parseFloat(price);
    const parsedDiscount = parseFloat(discount) || 0;
    const parsedStock = parseInt(stock, 10);

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError("El precio debe ser un número válido y mayor o igual a 0.");
      return;
    }

    if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
      setError("El descuento debe ser un número entre 0 y 100.");
      return;
    }

    if (isNaN(parsedStock) || parsedStock < 0) {
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
    };

    try {
      await onSave(updatedProduct);
      onClose();
    } catch (err: unknown) {
      console.error("Error al guardar los cambios:", err);
      setError(
        err instanceof Error ? err.message : "Error al actualizar el producto.",
      );
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
        <div className="flex gap-4">
          <Button
            className="bg-yellow-400 text-black py-2 rounded hover:bg-yellow-500 w-full"
            onClick={handleSave}
          >
            Guardar Cambios
          </Button>
          <Button
            className="bg-red-500 text-white py-2 rounded hover:bg-red-600 w-full"
            onClick={onClose}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default EditProductDialog;
