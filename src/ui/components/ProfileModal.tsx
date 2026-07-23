"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { toast } from "react-toastify";
import { Label } from "@/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { Camera, Lock } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import "react-toastify/dist/ReactToastify.css";

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => Promise<void>;

  // Si es un admin editando a otro user, puedes pasar un userId distinto
  targetUserId?: string;

  // Datos a mostrar en el modal
  userName?: string;
  firstName?: string;
  userLastName?: string;
  userPhone?: string;
  userEmergencyPhone?: string;
  userDocumentNumber?: string;
  userRole?: string;
  profileImage?: string | null;
}

export default function ProfileModal({
  isOpen,
  onClose,
  onSuccess,
  targetUserId,
  userName = "",
  firstName = "",
  userLastName = "",
  userPhone = "",
  userEmergencyPhone = "",
  userDocumentNumber = "",
  userRole = "",
  profileImage,
}: ProfileModalProps) {
  const router = useRouter();
  const { update: updateSession } = useSession();

  // Estados locales del form
  const [username, setUsername] = useState<string>(userName);
  const [firstNameLocal, setFirstNameLocal] = useState<string>(firstName);
  const [lastName, setLastName] = useState<string>(userLastName);
  const [phone, setPhone] = useState<string>(userPhone);
  const [emergencyPhone, setEmergencyPhone] = useState<string>(userEmergencyPhone);
  const [documentNumber, setDocumentNumber] = useState<string>(userDocumentNumber);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [currentProfileImage, setCurrentProfileImage] = useState<string | null>(profileImage || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Actualizar la imagen cuando cambie la prop
  useEffect(() => {
    setCurrentProfileImage(profileImage || null);
  }, [profileImage]);

  useEffect(() => {
    setUsername(userName || "");
    setFirstNameLocal(firstName || "");
    setLastName(userLastName || "");
    setPhone(userPhone || "");
    setEmergencyPhone(userEmergencyPhone || "");
    setDocumentNumber(userDocumentNumber || "");
  }, [firstName, userDocumentNumber, userEmergencyPhone, userLastName, userName, userPhone]);

  function validateFields() {
    if (!username.trim() || !firstNameLocal.trim() || !lastName.trim() || !phone.trim()) {
      toast.error("Faltan campos: usuario, nombre, apellidos o teléfono.");
      return false;
    }
    const dni = documentNumber.replace(/\D/g, "");
    if (dni && dni.length !== 8) {
      toast.error("El DNI debe tener 8 dígitos.");
      return false;
    }
    return true;
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Tipo de archivo no permitido. Solo JPG, PNG y WEBP.");
      return;
    }

    // Validar tamaño (5MB máximo)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande. Máximo 5 MB.");
      return;
    }

    // Mostrar previsualización inmediata
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        console.log("🖼️ Previsualización cargada:", e.target.result);
        setCurrentProfileImage(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);

    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/profile/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al subir la imagen");
      }

      // Actualizar con la URL real del servidor
      console.log("🖼️ URL de imagen actualizada:", data.imageUrl);
      setCurrentProfileImage(data.imageUrl);
      
      // Actualizar la sesión de NextAuth
      try {
        await updateSession({
          image: data.imageUrl
        });
        console.log("✅ Sesión actualizada con nueva imagen");
      } catch (sessionError) {
        console.error("⚠️ Error actualizando sesión:", sessionError);
        // Continuar aunque falle la actualización de sesión
      }
      
      toast.success("Imagen de perfil actualizada correctamente");
      
      // Recargar la información si hay callback
      if (onSuccess) {
        await onSuccess();
      }
    } catch (error) {
      console.error("Error al subir imagen:", error);
      toast.error("Error al subir la imagen de perfil");
      // Revertir a la imagen anterior en caso de error
      setCurrentProfileImage(profileImage || null);
    } finally {
      setIsUploadingImage(false);
      // Limpiar el input para permitir subir la misma imagen otra vez
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  async function handleSubmit() {
    if (!validateFields()) return;
    setIsSubmitting(true);

    try {
      // Decidir la ruta:
      // - /api/admin/update-user si eres admin actualizando a otro
      // - /api/user/update si es un user normal
      const endpoint = targetUserId
        ? "/api/admin/update-user"
        : "/api/user/update";

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetUserId, // solo si eres admin
          username: username.trim(),
          firstName: firstNameLocal.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          emergencyPhone: emergencyPhone.trim(),
          documentNumber: documentNumber.replace(/\D/g, "").slice(0, 8),
          dni: documentNumber.replace(/\D/g, "").slice(0, 8),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al actualizar los datos");
      }

      toast.success("Datos actualizados correctamente");
      onClose();

      // Recargar la lista o info
      if (onSuccess) {
        await onSuccess();
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al actualizar los datos.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="wolf-product-theme max-h-[92dvh] max-w-lg overflow-y-auto border border-[var(--wolf-app-border)] !bg-[var(--wolf-app-surface)] text-[var(--wolf-app-text)] shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-[var(--wolf-app-text)]">Editar perfil</DialogTitle>
          <DialogDescription className="text-[var(--wolf-app-muted)]">
            Gestiona tu información personal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--wolf-app-accent)] bg-[var(--wolf-app-accent)] sm:h-24 sm:w-24">
              {currentProfileImage ? (
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${currentProfileImage})` }}
                  role="img"
                  aria-label="Imagen de perfil"
                />
              ) : (
                <div className="text-xl font-bold text-[var(--wolf-app-bg)]">
                  {firstNameLocal.charAt(0).toUpperCase() || "U"}
                  {lastName.charAt(0).toUpperCase() || "N"}
                </div>
              )}
            </div>
            <Button
              size="icon"
              className="absolute bottom-0 right-0 rounded-full bg-[var(--wolf-app-accent)] text-[var(--wolf-app-bg)] hover:bg-[var(--wolf-app-accent-hover)] disabled:opacity-50"
              onClick={handleCameraClick}
              disabled={isUploadingImage}
            >
              {isUploadingImage ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--wolf-app-bg)] border-r-transparent"></div>
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* Nombre y rol */}
          <div>
            <h1 className="text-xl font-bold text-[var(--wolf-app-text)] sm:text-2xl">
              {firstNameLocal} {lastName}
            </h1>
            <p className="text-[var(--wolf-app-muted)]">{userRole || "Usuario"}</p>
          </div>
        </div>

        {/* Formulario */}
        <div className="space-y-4 mt-4">
          {/* Nombre de Usuario */}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-[var(--wolf-app-muted)]">Usuario</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="wolf-control"
            />
          </div>

          {/* Nombre real */}
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-[var(--wolf-app-muted)]">Nombre</Label>
            <Input
              id="firstName"
              value={firstNameLocal}
              onChange={(e) => setFirstNameLocal(e.target.value)}
              className="wolf-control"
            />
          </div>

          {/* Apellidos */}
          <div className="space-y-2">
            <Label htmlFor="lastName" className="text-[var(--wolf-app-muted)]">Apellidos</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="wolf-control"
            />
          </div>

          {/* Teléfono principal */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-[var(--wolf-app-muted)]">Teléfono</Label>
            <div>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="wolf-control"
              />
            </div>
          </div>

          {/* Teléfono de emergencia */}
          <div className="space-y-2">
            <Label htmlFor="emergencyPhone" className="text-[var(--wolf-app-muted)]">Teléfono de emergencia</Label>
            <div>
              <Input
                id="emergencyPhone"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                className="wolf-control"
              />
            </div>
          </div>

          {/* DNI */}
          <div className="space-y-2">
            <Label htmlFor="documentNumber" className="text-[var(--wolf-app-muted)]">DNI</Label>
            <div>
              <Input
                id="documentNumber"
                value={documentNumber}
                onChange={(e) =>
                  setDocumentNumber(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                placeholder="8 dígitos"
                className="wolf-control"
              />
            </div>
          </div>

          {/* Botón guardar */}
          <Button
            className="wolf-button wolf-button-primary w-full"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Guardando..." : "Guardar cambios"}
          </Button>

          {/* Cambiar contraseña */}
          <Button
            className="wolf-button w-full"
            onClick={() => {
              onClose();
              router.push("/profile/security");
            }}
          >
            Cambiar contraseña
            <Lock className="ml-2 h-4 w-4" />
          </Button>

          {/* Cerrar sesión */}
          <Button
            variant="destructive"
            className="w-full rounded-lg"
            onClick={() => signOut()}
          >
            Cerrar sesión
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
