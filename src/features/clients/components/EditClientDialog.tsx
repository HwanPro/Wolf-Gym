"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import MembershipSelection from "@/ui/components/MembershipSelection";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/ui/dialog";
import { Pencil } from "lucide-react";
import {
  dialogSurfaceClass,
  fieldClass,
  helperTextClass,
  labelClass,
  phoneInputClass,
  sectionClass,
} from "../lib/form-styles";

interface Client {
  id: string;
  userName: string;
  firstName: string;
  lastName: string;
  email: string;
  plan: string;
  membershipStart: string;
  membershipEnd: string;
  phone: string;
  emergencyPhone: string;
  documentNumber?: string;
  address?: string;
  social?: string;
  hasPaid: boolean;
  password?: string;
  debt?: number;
  image?: string;
}

interface EditClientDialogProps {
  client: Client;
  onUpdate: (updatedClient: Client) => Promise<void>;
  compactTrigger?: boolean;
}

export default function EditClientDialog({
  client,
  onUpdate,
  compactTrigger = false,
}: EditClientDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<Client>(client);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    client.image || null
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormData(client);
    setImagePreview(client.image || null);
    setImageFile(null);
  }, [client]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [event.target.name]: event.target.value,
    }));
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const body = new FormData();
    body.append("file", file);
    body.append("folder", "users");

    const response = await fetch("/api/uploads", {
      method: "POST",
      body,
    });

    if (!response.ok) throw new Error("Error uploading image");

    const data = await response.json();
    return data.fileUrl;
  };

  const formatDateToISO = (date: string) => {
    if (!date) return "";
    const parsedDate = new Date(date);
    return Number.isNaN(parsedDate.getTime())
      ? date.slice(0, 10)
      : parsedDate.toISOString().split("T")[0];
  };

  const handleSave = async () => {
    try {
      setUploading(true);

      if (formData.phone && !isValidPhoneNumber(formData.phone)) {
        toast.error("El número de teléfono principal no es válido.");
        return;
      }
      if (
        formData.emergencyPhone &&
        !isValidPhoneNumber(formData.emergencyPhone)
      ) {
        toast.error("El número de emergencia no es válido.");
        return;
      }

      const cleanDocumentNumber = String(formData.documentNumber || "").replace(
        /\D/g,
        ""
      );
      if (cleanDocumentNumber && cleanDocumentNumber.length !== 8) {
        toast.error("El DNI debe tener 8 dígitos.");
        return;
      }

      let imageUrl = formData.image;
      if (imageFile) imageUrl = await uploadImage(imageFile);

      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        plan: formData.plan,
        startDate: formatDateToISO(formData.membershipStart),
        endDate: formatDateToISO(formData.membershipEnd),
        phone: formData.phone || "",
        emergencyPhone: formData.emergencyPhone || "",
        documentNumber: cleanDocumentNumber,
        address: formData.address || "",
        social: formData.social || "",
        image: imageUrl,
      };

      const response = await fetch(`/api/clients/${formData.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Error al actualizar el cliente");
      }

      await onUpdate({ ...formData, image: imageUrl });
      setIsOpen(false);
      toast.success("Cliente actualizado exitosamente");
    } catch (error) {
      console.error("Error al actualizar cliente:", error);
      toast.error(
        error instanceof Error ? error.message : "No se pudo actualizar el cliente."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          title={compactTrigger ? "Editar cliente" : undefined}
          aria-label={compactTrigger ? "Editar cliente" : undefined}
          className={
            compactTrigger
              ? "h-9 w-9 border border-white/15 bg-zinc-900 p-0 text-zinc-100 hover:bg-zinc-800"
              : "bg-wolf-primary text-wolf-ink hover:bg-yellow-300"
          }
        >
          {compactTrigger ? <Pencil className="h-4 w-4" /> : "Editar"}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto border-0 bg-transparent p-0 shadow-none">
        <div className={dialogSurfaceClass}>
          <DialogTitle className="sr-only">Editar cliente</DialogTitle>

          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-600">
              Cliente
            </p>
            <h2 className="text-xl font-black text-slate-900">Editar perfil</h2>
          </div>

          <section className={sectionClass}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-wolf-border bg-white">
                {imagePreview ? (
                  <Image
                    src={imagePreview}
                    alt="Foto del cliente"
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-black text-wolf-primary-strong">
                    {formData.firstName?.charAt(0) || "W"}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">Foto de perfil</p>
                <p className={helperTextClass}>
                  Usa una foto clara para ubicar al cliente rápido en recepción.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                  className="mt-3 !border-wolf-border !bg-white !text-wolf-ink hover:!bg-wolf-muted"
                >
                  {imagePreview ? "Cambiar foto" : "Subir foto"}
                </Button>
              </div>
            </div>
          </section>

          <section className={`${sectionClass} mt-3`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <input
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </Field>
              <Field label="Apellidos">
                <input
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </Field>
              <Field label="Correo">
                <input
                  value={formData.email}
                  readOnly
                  className={`${fieldClass} cursor-not-allowed bg-slate-100 text-wolf-subtle`}
                />
              </Field>
              <Field label="DNI">
                <input
                  name="documentNumber"
                  inputMode="numeric"
                  maxLength={8}
                  value={formData.documentNumber || ""}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      documentNumber: event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 8),
                    }))
                  }
                  className={fieldClass}
                  placeholder="8 dígitos"
                />
              </Field>
              <Field label="Teléfono">
                <PhoneInput
                  value={formData.phone}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, phone: value || "" }))
                  }
                  defaultCountry="PE"
                  className={phoneInputClass}
                />
              </Field>
              <Field label="Teléfono de emergencia">
                <PhoneInput
                  value={formData.emergencyPhone}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      emergencyPhone: value || "",
                    }))
                  }
                  defaultCountry="PE"
                  className={phoneInputClass}
                />
              </Field>
              <Field label="Dirección">
                <input
                  name="address"
                  value={formData.address || ""}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </Field>
              <Field label="Red social">
                <input
                  name="social"
                  value={formData.social || ""}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </Field>
            </div>
          </section>

          <section className={`${sectionClass} mt-3`}>
            <MembershipSelection
              onPlanSelect={(selectedPlan, startDate, endDate) => {
                setFormData((prev) => ({
                  ...prev,
                  plan: selectedPlan,
                  membershipStart: startDate,
                  membershipEnd: endDate,
                }));
              }}
            />
          </section>

          <section className={`${sectionClass} mt-3`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Inicio">
                <input
                  type="date"
                  name="membershipStart"
                  value={formatDateToISO(formData.membershipStart)}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </Field>
              <Field label="Fin">
                <input
                  type="date"
                  name="membershipEnd"
                  value={formatDateToISO(formData.membershipEnd)}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </Field>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              onClick={() => setIsOpen(false)}
              variant="outline"
              className="!border-wolf-border !bg-white !text-wolf-ink hover:!bg-wolf-muted"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={uploading}
              className="bg-wolf-primary font-bold text-wolf-ink hover:bg-yellow-300"
            >
              {uploading ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}
