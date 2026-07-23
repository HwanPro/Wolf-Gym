import { useState } from "react";
import { Button } from "@/ui/button";
import { toast } from "react-toastify";
import { DialogClose } from "@radix-ui/react-dialog";

type NewProduct = {
  name: string;
  description: string;
  price: number;
  discount: number;
  stock: number;
  imageUrl: string;
  isGymProduct: boolean;
  category: string;
};

function AddProductDialog({
  onSave,
  onClose,
}: {
  onSave: (product: NewProduct) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [discount, setDiscount] = useState<string>("");
  const [stock, setStock] = useState<string>("");
  const [image, setImage] = useState<File | null>(null);
  const [isGymProduct, setIsGymProduct] = useState<boolean>(false);
  const [category, setCategory] = useState<string>("");

  const handleAddProduct = async () => {
    if (!name || !description || !price || !stock || !image) {
      toast.error("Todos los campos son obligatorios", {
        position: "top-center",
      });
      return;
    }

    if (parseFloat(price) <= 0 || parseInt(stock) < 0) {
      toast.error(
        "El precio debe ser mayor a 0 y el stock no puede ser negativo",
        { position: "top-center" },
      );
      return;
    }

    try {
      const formData = new FormData();
      formData.append("item_name", name);
      formData.append("item_description", description);
      formData.append("item_price", price);
      formData.append("item_discount", discount || "0");
      formData.append("item_stock", stock);
      formData.append("isGymProduct", isGymProduct.toString());
      formData.append("category", category);
      formData.append("file", image);

      const response = await fetch("/api/products", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error al crear el producto:", errorText);
        toast.error("Error al crear el producto", { position: "top-center" });
        return;
      }

      const data = await response.json();

      onSave({
        name: data.product.item_name,
        description: data.product.item_description,
        price: data.product.item_price,
        discount: data.product.item_discount,
        stock: data.product.item_stock,
        imageUrl: data.product.item_image_url,
        isGymProduct: data.product.is_admin_only || false,
        category: data.product.item_category || "",
      });

      resetForm();
      onClose();
      toast.success("Producto agregado con éxito", { position: "top-right" });
    } catch (error) {
      console.error("Error en el proceso de subida:", error);
      toast.error("Error inesperado", { position: "top-center" });
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrice("");
    setDiscount("");
    setStock("");
    setImage(null);
    setIsGymProduct(false);
    setCategory("");
  };

  return (
    <div className="wolf-product-theme w-full bg-zinc-950 text-zinc-100">
      <div className="relative w-full">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Agregar producto</h2>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Nombre del producto *
            </label>
            <input
              type="text"
              placeholder="Ej: Proteína Whey"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="wolf-control px-3 text-sm outline-none focus:ring-2 focus:ring-yellow-400/25"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Descripción *
            </label>
            <textarea
              placeholder="Describe el producto..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="wolf-control min-h-24 resize-none p-3 text-sm outline-none focus:ring-2 focus:ring-yellow-400/25"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Precio (S/) *
              </label>
              <input
                type="number"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="wolf-control px-3 text-sm outline-none focus:ring-2 focus:ring-yellow-400/25"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Descuento (%)
              </label>
              <input
                type="number"
                placeholder="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="wolf-control px-3 text-sm outline-none focus:ring-2 focus:ring-yellow-400/25"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Stock *
            </label>
            <input
              type="number"
              placeholder="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="wolf-control px-3 text-sm outline-none focus:ring-2 focus:ring-yellow-400/25"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Imagen del producto *
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setImage(e.target.files ? e.target.files[0] : null)
              }
              className="w-full rounded-md border border-white/15 bg-zinc-900 p-2 text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-yellow-400 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-black hover:file:bg-yellow-300"
            />
          </div>

          {/* Checkbox para producto de gimnasio */}
          <div className="flex items-center rounded-md border border-white/10 bg-zinc-900 p-4">
            <input
              type="checkbox"
              id="isGymProduct"
              checked={isGymProduct}
              onChange={(e) => setIsGymProduct(e.target.checked)}
              className="h-4 w-4 text-yellow-400 focus:ring-yellow-400 border-gray-300 rounded"
            />
            <label
              htmlFor="isGymProduct"
              className="ml-3 text-sm font-medium text-zinc-300"
            >
              Solo para gimnasio (no se mostrará al público)
            </label>
          </div>

          {/* Campo de categoría */}
          {isGymProduct && (
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="wolf-control px-3 text-sm outline-none focus:ring-2 focus:ring-yellow-400/25"
              >
                <option value="">Seleccionar categoría</option>
                <option value="agua">Agua</option>
                <option value="proteina">Proteína</option>
                <option value="pre-entreno">Pre-entreno</option>
                <option value="suplementos">Suplementos</option>
                <option value="snacks">Snacks</option>
                <option value="otros">Otros</option>
              </select>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-8 flex gap-3">
          <DialogClose asChild>
            <Button
              onClick={onClose}
              className="flex-1 border border-white/15 bg-zinc-900 py-3 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
            >
              Cancelar
            </Button>
          </DialogClose>
          <Button
            className="flex-1 bg-yellow-400 text-black py-3 text-sm rounded-lg hover:bg-yellow-500 font-medium shadow-md"
            onClick={handleAddProduct}
          >
            Guardar Producto
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AddProductDialog;
