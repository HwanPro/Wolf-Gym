"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FaFacebook, FaInstagram, FaTwitter } from "react-icons/fa";
import Image from "next/image";
import Script from "next/script";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSession, signIn } from "next-auth/react";
import StoriesCarousel from "@/ui/components/StoriesCarousel";
import { Button } from "@/ui/button";
import { Dumbbell, Users, Calendar, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/ui/dialog";
import {
  DEFAULT_MEMBERSHIP_PLANS,
  type MembershipPlanView,
} from "@/lib/membershipPlans";

// ------------------------
// COMPONENTE AUXILIAR: EditPlanForm
// ------------------------
type Plan = MembershipPlanView;

interface EditPlanFormProps {
  plan: Plan;
  onClose: () => void;
  onSaveSuccess: () => void;
}

function EditPlanForm({ plan, onClose, onSaveSuccess }: EditPlanFormProps) {
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(plan.price);
  const [description, setDescription] = useState(plan.description || "");

  const handleSave = async () => {
    try {
      if (!plan.id) {
        toast.error("Este plan no tiene ID para actualizarse.");
        return;
      }

      const resp = await fetch(`/api/plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, price, description }),
      });
      if (!resp.ok) {
        throw new Error("Error al actualizar el plan");
      }
      toast.success("Plan actualizado con éxito");
      onSaveSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Error al actualizar el plan");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold mb-1">Nombre</label>
        <input
          type="text"
          className="w-full p-2 border rounded"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="block text-sm font-bold mb-1">Precio</label>
        <input
          type="number"
          className="w-full p-2 border rounded"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
      </div>
      <div>
        <label className="block text-sm font-bold mb-1">Descripción</label>
        <textarea
          className="w-full p-2 border rounded"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button onClick={handleSave}>Guardar</Button>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ------------------------
// COMPONENTE AUXILIAR: EditGalleryForm
// ------------------------
type GalleryItem = {
  id: string;
  imageUrl: string;
};

const FALLBACK_GYM_IMAGE = "/icons/icon-512.png";

function GalleryImage({ item }: { item: GalleryItem }) {
  const backgroundImage = item.imageUrl
    ? `url("${item.imageUrl}"), url("${FALLBACK_GYM_IMAGE}")`
    : `url("${FALLBACK_GYM_IMAGE}")`;

  return (
    <div
      role="img"
      aria-label="Imagen de galería"
      className="aspect-[4/3] w-full bg-[#141414] bg-center bg-no-repeat transition duration-300 group-hover:scale-[1.03]"
      style={{
        backgroundImage,
        backgroundSize: item.imageUrl ? "cover, 42%" : "42%",
      }}
    />
  );
}

const featureHighlights = [
  {
    title: "Equipos completos",
    description:
      "Cardio, fuerza y entrenamiento funcional en un espacio preparado para progresar todos los días.",
    icon: Dumbbell,
  },
  {
    title: "Entrenadores cerca",
    description:
      "Acompañamiento técnico para ordenar tu rutina, corregir movimientos y sostener el avance.",
    icon: Users,
  },
  {
    title: "Planes flexibles",
    description:
      "Membresías claras para entrenar por mes, temporada o con objetivos más exigentes.",
    icon: Calendar,
  },
  {
    title: "Horario amplio",
    description:
      "Lunes a viernes de 6:00 AM a 9:00 PM y sábados de 6:00 AM a 8:00 PM.",
    icon: Clock,
  },
];

interface EditGalleryFormProps {
  item: GalleryItem;
  onClose: () => void;
  onSaveSuccess: () => void;
}

function EditGalleryForm({
  item,
  onClose,
  onSaveSuccess,
}: EditGalleryFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append("file", selectedFile);
    try {
      const resp = await fetch(`/api/gallery/${item.id}`, {
        method: "PUT", // asumiendo que PUT actualiza la imagen
        body: formData,
      });
      if (!resp.ok) throw new Error("Error al actualizar la imagen");
      toast.success("Imagen actualizada con éxito");
      onSaveSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error al actualizar la imagen");
    }
  };

  const handleDelete = async () => {
    try {
      const resp = await fetch(`/api/gallery/${item.id}`, {
        method: "DELETE",
      });
      if (!resp.ok) throw new Error("Error al eliminar la imagen");
      toast.success("Imagen eliminada");
      onSaveSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error al eliminar la imagen");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Image
          src={item.imageUrl}
          alt="Galería"
          width={300}
          height={200}
          className="rounded"
        />
      </div>
      <div>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="w-full"
        />
      </div>
      <div className="flex justify-between">
        <Button onClick={handleUpload}>Actualizar Imagen</Button>
        <Button variant="destructive" onClick={handleDelete}>
          Borrar Imagen
        </Button>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ------------------------
// COMPONENTE PRINCIPAL: WolfGymLanding
// ------------------------
export default function WolfGymLanding() {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const [culqiReady, setCulqiReady] = useState(false);

  // Estados para editar planes y galería (admin)
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [modalPlan, setModalPlan] = useState<Plan | null>(null);
  const [showEditGalleryModal, setShowEditGalleryModal] = useState(false);
  const [modalGalleryItem, setModalGalleryItem] = useState<GalleryItem | null>(
    null,
  );
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);

  const { data: session } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "admin";
  const [membershipPlans, setMembershipPlans] = useState<Plan[]>(
    DEFAULT_MEMBERSHIP_PLANS,
  );

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/plans");
      const data = await res.json();
      setMembershipPlans(
        Array.isArray(data) && data.length > 0
          ? data
          : DEFAULT_MEMBERSHIP_PLANS,
      );
    } catch (err) {
      console.error("Error al cargar planes:", err);
      setMembershipPlans(DEFAULT_MEMBERSHIP_PLANS);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  function getPlanAmountCents(plan: Plan) {
    return plan.amountCents ?? Math.round(Number(plan.price || 0) * 100);
  }

  function getPlanDescription(plan: Plan) {
    return `${plan.name} - S/${Number(plan.price || 0).toFixed(2)}`;
  }

  function formatPlanDuration(plan: Plan) {
    const days = plan.durationDays;
    if (!days) return "Acceso vigente";
    if (days === 1) return "1 día";
    if (days % 30 === 0 && days < 365) {
      const months = days / 30;
      return `${months} mes${months === 1 ? "" : "es"}`;
    }
    if (days === 365) return "1 año";
    return `${days} días`;
  }

  function canEditPlan(plan: Plan) {
    return Boolean(plan.id);
  }

  // Función para abrir el modal de edición de un plan (admin)
  function openEditPlanModal(plan: Plan) {
    setModalPlan(plan);
    setShowEditPlanModal(true);
    console.log("Editar plan:", plan);
  }

  // Función para abrir el modal de edición de un item de galería (admin)
  function openEditGalleryModal(item: GalleryItem) {
    setModalGalleryItem(item);
    setShowEditGalleryModal(true);
    console.log("Editar item de galería:", item);
  }

  // Manejo de planes vía Culqi (para clientes)
  const handlePlanSelection = async (planInfo: {
    amount: number;
    description: string;
  }) => {
    if (!session) {
      signIn();
      return;
    }
    if (!culqiReady || !window.Culqi) {
      toast.error("Pasarela de pago no disponible. Intenta nuevamente.");
      return;
    }
    window.Culqi.publicKey = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY!;
    window.Culqi.settings({
      title: "Wolf Gym",
      currency: "PEN",
      description: planInfo.description,
      amount: planInfo.amount,
    });
    window.Culqi.token = async (tokenObject: { id: string }) => {
      console.log("Token de Culqi:", tokenObject);
      try {
        const resp = await fetch("/api/payaments/culqui", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: tokenObject.id,
            amount: planInfo.amount,
            description: planInfo.description,
            email: session?.user?.email || "cliente@example.com",
          }),
        });
        if (!resp.ok) {
          throw new Error("Error al procesar el pago");
        }
        const data = await resp.json();
        console.log("Pago realizado con éxito:", data);
        alert("¡Pago exitoso! Se te ha asignado el plan.");
      } catch (error) {
        console.error("Error al procesar el pago:", error);
        alert("Hubo un problema procesando el pago.");
      }
      setModalAbierto(false);
    };
    window.Culqi.open();
  };

  // Efecto: botones sticky
  useEffect(() => {
    function onScroll() {
      setShowSticky(window.scrollY > 800);
    }
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Cargar la galería (se asume endpoint /api/gallery retorna [{ id, imageUrl }])
  const fetchGalleryItems = async () => {
    try {
      const res = await fetch("/api/gallery");
      if (!res.ok) throw new Error("Error al cargar galería");
      const data = await res.json();
      setGalleryItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar la galería.");
    }
  };

  useEffect(() => {
    fetchGalleryItems();
  }, []);

  // Botón sticky
  function StickyButtons() {
    if (!showSticky) return null;
    return (
      <div className="fixed left-0 right-0 top-0 z-50 border-b border-[#FFC21A]/20 bg-[#0A0A0A]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0A0A0A]/85">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-5">
          <h1 className="text-sm font-black uppercase text-[#FFC21A] sm:text-base">
            Wolf Gym
          </h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              className="bg-[#FFC21A] px-3 py-1 text-xs font-bold text-[#0A0A0A] hover:bg-[#E5A800]"
              onClick={() => setModalAbierto(true)}
            >
              Comenzar
            </Button>
            <Button
              variant="outline"
              className="border-[#FFC21A] bg-[#0A0A0A] px-3 py-1 text-xs text-[#FFC21A] hover:bg-[#FFC21A] hover:text-[#0A0A0A]"
              onClick={handleProducts}
            >
              Productos
            </Button>
            {session ? (
              <Button
                onClick={() =>
                  session.user.role === "admin"
                    ? router.push("/admin/dashboard")
                    : router.push("/client/dashboard")
                }
                className="bg-[#FFC21A] px-3 py-1 text-xs text-[#0A0A0A] hover:bg-[#E5A800]"
              >
                {session.user.role === "admin" ? "Panel Admin" : "Mi Perfil"}
              </Button>
            ) : (
              <Button
                onClick={handleLogin}
                className="border border-[#FFC21A] bg-[#0A0A0A] px-3 py-1 text-xs text-[#FFC21A] hover:bg-[#FFC21A] hover:text-[#0A0A0A]"
              >
                Inicia sesión
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Funciones de navegación
  const handleLogin = () => {
    router.push("/auth/login");
  };
  const handleProducts = () => {
    router.push("/products/public");
  };

  return (
    <div className="min-h-dvh bg-black text-white">
      <Script
        src="https://checkout.culqi.com/js/v4"
        strategy="afterInteractive"
        onLoad={() => setCulqiReady(true)}
      />
      <StickyButtons />
      {showEditPlanModal && modalPlan && (
        <Dialog
          open={showEditPlanModal}
          onOpenChange={(open) => {
            setShowEditPlanModal(open);
            if (!open) setModalPlan(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Plan</DialogTitle>
            </DialogHeader>
            <EditPlanForm
              plan={modalPlan}
              onClose={() => setShowEditPlanModal(false)}
              onSaveSuccess={fetchPlans}
            />
          </DialogContent>
        </Dialog>
      )}

      {showEditGalleryModal && modalGalleryItem && (
        <Dialog
          open={showEditGalleryModal}
          onOpenChange={(open) => {
            setShowEditGalleryModal(open);
            if (!open) setModalGalleryItem(null);
          }}
        >
          <DialogContent className="bg-white text-black rounded-lg p-8 shadow-lg max-w-md mx-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold mb-2">
                Editar Imagen de Galería
              </DialogTitle>
              <DialogDescription className="text-gray-500 mb-6">
                Actualiza o borra esta imagen.
              </DialogDescription>
            </DialogHeader>
            <EditGalleryForm
              item={modalGalleryItem}
              onClose={() => setShowEditGalleryModal(false)}
              onSaveSuccess={fetchGalleryItems}
            />
          </DialogContent>
        </Dialog>
      )}

      <main className="flex-1">
        <section
          className="relative isolate flex min-h-[92svh] w-full items-center overflow-hidden bg-[#0A0A0A] px-5 py-16 text-white sm:px-8 lg:px-12"
          role="banner"
        >
          <div className="absolute inset-y-0 right-0 hidden w-1/2 border-l border-[#FFC21A]/10 bg-[#141414] lg:block" />
          <div className="absolute -right-20 top-10 hidden opacity-10 lg:block">
            <Image
              src="/icons/icon-512.png"
              alt=""
              width={520}
              height={520}
              priority
              className="h-auto w-[520px]"
              style={{ height: "auto" }}
            />
          </div>

          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-black uppercase text-[#FFC21A]">
                Gimnasio en Ica
              </p>
              <h1 className="text-balance text-5xl font-black uppercase leading-none text-white sm:text-6xl lg:text-8xl">
                Wolf <span className="text-[#FFC21A]">Gym</span>
              </h1>
              <p className="mt-5 max-w-2xl text-lg font-semibold text-[#F5F5F4] sm:text-xl">
                Entrena con equipos completos, asesoría directa y planes hechos
                para mantenerte constante.
              </p>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/65 sm:text-base">
                Av. Peru 622, Ica. Un espacio oscuro, fuerte y ordenado para
                enfocarte en lo que importa: llegar, entrenar y avanzar.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  className="h-11 bg-[#FFC21A] px-6 font-black uppercase text-[#0A0A0A] hover:bg-[#E5A800]"
                  onClick={() => setModalAbierto(true)}
                >
                  Comenzar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 border-[#FFC21A] bg-transparent px-6 font-bold uppercase text-[#FFC21A] hover:bg-[#FFC21A] hover:text-[#0A0A0A]"
                  onClick={handleProducts}
                >
                  Ver productos
                </Button>
                {session ? (
                  <Button
                    type="button"
                    className="h-11 bg-white px-6 font-bold uppercase text-[#0A0A0A] hover:bg-[#F5F5F4]"
                    onClick={() =>
                      session.user.role === "admin"
                        ? router.push("/admin/dashboard")
                        : router.push("/client/dashboard")
                    }
                  >
                    {session.user.role === "admin"
                      ? "Panel Admin"
                      : "Mi Perfil"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="h-11 border border-white/30 bg-[#0A0A0A] px-6 font-bold uppercase text-white hover:bg-white hover:text-[#0A0A0A]"
                    onClick={handleLogin}
                  >
                    Inicia sesión
                  </Button>
                )}
              </div>

              <div className="mt-10 grid max-w-2xl grid-cols-3 border-y border-[#FFC21A]/20 py-5">
                <div>
                  <p className="text-3xl font-black text-[#FFC21A]">6AM</p>
                  <p className="mt-1 text-xs uppercase text-white/50">
                    Apertura
                  </p>
                </div>
                <div className="border-x border-[#FFC21A]/20 px-5">
                  <p className="text-3xl font-black text-white">622</p>
                  <p className="mt-1 text-xs uppercase text-white/50">
                    Av. Peru
                  </p>
                </div>
                <div className="pl-5">
                  <p className="text-3xl font-black text-[#FF7A1A]">Ica</p>
                  <p className="mt-1 text-xs uppercase text-white/50">Sede</p>
                </div>
              </div>
            </div>

            <div className="relative mx-auto flex w-full max-w-[520px] items-center justify-center lg:justify-end">
              <div className="absolute inset-8 border border-[#FFC21A]/20" />
              <div className="relative aspect-square w-full max-w-[440px] bg-[#141414] p-8">
                <Image
                  src="/icons/icon-512.png"
                  alt="Wolf Gym"
                  width={500}
                  height={500}
                  priority
                  sizes="(max-width: 1024px) 80vw, 440px"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          </div>
        </section>

        <StoriesCarousel />

        <section
          id="features"
          className="w-full bg-[#F5F5F4] px-5 py-16 text-[#0A0A0A] sm:px-8 lg:px-12 lg:py-24"
          aria-labelledby="features-heading"
        >
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="mb-3 text-xs font-black uppercase text-[#FF7A1A]">
                  Experiencia Wolf
                </p>
                <h2
                  id="features-heading"
                  className="text-4xl font-black uppercase leading-none sm:text-5xl"
                >
                  Entrena fuerte, sin distracciones.
                </h2>
                <p className="mt-5 max-w-lg text-base leading-7 text-[#6B6B68]">
                  Cada zona está pensada para que llegues con un plan claro,
                  entrenes sin perder tiempo y midas tu avance semana a semana.
                </p>
              </div>
              <div className="grid gap-px overflow-hidden border border-[#0A0A0A]/10 bg-[#0A0A0A]/10 sm:grid-cols-2">
                {featureHighlights.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div key={feature.title} className="bg-[#F5F5F4] p-6">
                      <Icon className="mb-5 h-10 w-10 text-[#FFC21A]" />
                      <h3 className="text-xl font-black text-[#0A0A0A]">
                        {feature.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-[#6B6B68]">
                        {feature.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section
          id="pricing"
          className="bg-[#0A0A0A] px-5 py-16 text-white sm:px-8 lg:px-12 lg:py-24"
          aria-labelledby="pricing-heading"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 flex flex-col justify-between gap-5 border-b border-[#FFC21A]/20 pb-8 md:flex-row md:items-end">
              <div>
                <p className="mb-3 text-xs font-black uppercase text-[#FFC21A]">
                  Membresías
                </p>
                <h2
                  id="pricing-heading"
                  className="text-4xl font-black uppercase leading-none sm:text-5xl"
                >
                  Planes para empezar hoy.
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-white/60">
                Todos los planes mantienen acceso al gimnasio y asesoría para
                organizar tu entrenamiento.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {membershipPlans.map((plan) => (
                <div
                  key={plan.id || plan.name}
                  className="flex min-h-[310px] flex-col border border-[#FFC21A]/20 bg-[#141414] p-6 text-white transition hover:border-[#FFC21A]/60"
                >
                  <p className="text-xs font-black uppercase text-[#FF7A1A]">
                    Membresía
                  </p>
                  <h3 className="mt-3 text-2xl font-black uppercase text-white">
                    {plan.name}
                  </h3>
                  <div className="mt-5 text-4xl font-black text-[#FFC21A]">
                    S/ {plan.price.toFixed(2)}
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-6 text-white/60">
                    {plan.description}
                  </p>
                  {isAdmin ? (
                    <Button
                      onClick={() => openEditPlanModal(plan)}
                      className="mt-6 bg-[#FFC21A] font-bold text-[#0A0A0A] hover:bg-[#E5A800]"
                      disabled={!canEditPlan(plan)}
                    >
                      {canEditPlan(plan) ? "Editar Plan" : "Plan base"}
                    </Button>
                  ) : (
                    <Button
                      onClick={() =>
                        handlePlanSelection({
                          amount: getPlanAmountCents(plan),
                          description: getPlanDescription(plan),
                        })
                      }
                      className="mt-6 bg-[#FFC21A] font-bold text-[#0A0A0A] hover:bg-[#E5A800]"
                    >
                      Elegir Plan
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="gallery"
          className="w-full bg-[#F5F5F4] px-5 py-16 text-[#0A0A0A] sm:px-8 lg:px-12 lg:py-24"
          aria-labelledby="gallery-heading"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="mb-3 text-xs font-black uppercase text-[#FF7A1A]">
                  Instalaciones
                </p>
                <h2
                  id="gallery-heading"
                  className="text-4xl font-black uppercase leading-none sm:text-5xl"
                >
                  Mira el espacio antes de venir.
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-[#6B6B68]">
                Ambiente, equipos y zonas de entrenamiento de Wolf Gym en Ica.
              </p>
            </div>

            {isAdmin && (
              <div className="mb-8 border border-[#0A0A0A]/10 bg-white p-4">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fileInput = form.elements.namedItem(
                      "file",
                    ) as HTMLInputElement;
                    if (!fileInput?.files?.[0]) return;

                    const formData = new FormData();
                    formData.append("file", fileInput.files[0]);

                    try {
                      const res = await fetch("/api/gallery", {
                        method: "POST",
                        body: formData,
                      });
                      if (!res.ok) throw new Error("Error al subir la imagen");
                      toast.success("Imagen subida con éxito");
                      fetchGalleryItems();
                      form.reset();
                    } catch (err) {
                      console.error(err);
                      toast.error("Error al subir imagen");
                    }
                  }}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center"
                >
                  <input
                    type="file"
                    name="file"
                    accept="image/*"
                    className="min-w-0 flex-1 border border-[#0A0A0A]/20 bg-[#F5F5F4] p-2 text-sm"
                    required
                  />
                  <Button
                    type="submit"
                    className="bg-[#FFC21A] font-bold text-[#0A0A0A] hover:bg-[#E5A800]"
                  >
                    Subir Imagen
                  </Button>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {galleryItems.map((item) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden border border-[#0A0A0A]/10 bg-white"
                >
                  <GalleryImage item={item} />
                  {isAdmin && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#0A0A0A]/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        onClick={() => openEditGalleryModal(item)}
                        className="bg-[#FFC21A] px-3 py-1 text-xs font-bold text-[#0A0A0A] hover:bg-[#E5A800]"
                      >
                        Editar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer
        className="bg-[#0A0A0A] px-5 py-10 text-white sm:px-8 lg:px-12"
        role="contentinfo"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-center justify-center gap-8 md:justify-between">
            <div className="w-full md:w-1/3 mb-6 md:mb-0 text-center md:text-left">
              <h3 className="mb-2 text-2xl font-black uppercase text-[#FFC21A]">
                Wolf Gym Ica
              </h3>
              <p className="text-sm text-white/65">
                El mejor gimnasio de Ica. Transformando vidas, un entrenamiento
                a la vez.
              </p>
              <p className="mt-2 text-sm text-white/65">
                <strong>Horarios:</strong> L-V 6AM-9PM | Sáb 6AM-8PM
              </p>
            </div>
            <div className="flex space-x-6 mb-4 md:mb-0">
              <a
                href="https://www.facebook.com/wolfgym"
                className="text-2xl text-white hover:text-[#FFC21A]"
                aria-label="Síguenos en Facebook"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaFacebook />
              </a>
              <a
                href="https://www.instagram.com/wolfgym"
                className="text-2xl text-white hover:text-[#FFC21A]"
                aria-label="Síguenos en Instagram"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaInstagram />
              </a>
              <a
                href="https://twitter.com/wolfgym"
                className="text-2xl text-white hover:text-[#FFC21A]"
                aria-label="Síguenos en Twitter"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaTwitter />
              </a>
            </div>
            <div className="w-full md:w-1/3 text-center md:text-right">
              <h4 className="mb-2 text-lg font-black uppercase">
                Visítanos en Ica
              </h4>
              <address className="mb-2 text-sm not-italic text-white/65">
                Av. Peru 622, Ica 11003, Perú
              </address>
              <a
                href="https://maps.app.goo.gl/jnQge8XcuerTmnZRA"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#FFC21A] hover:text-[#FF7A1A]"
              >
                Ver en Google Maps
              </a>
            </div>
            <div className="w-full text-center mt-6">
              <h2 className="text-3xl font-black uppercase text-[#FFC21A] md:text-4xl">
                PROHIBIDO RENDIRSE
              </h2>
            </div>
          </div>
          <div className="mt-8 border-t border-[#FFC21A]/20 pt-8 text-center">
            <p className="text-sm text-white/55">
              © 2024 Wolf Gym Ica. Todos los derechos reservados. Gimnasio en
              Ica, Perú
            </p>
          </div>
        </div>
      </footer>

      {/* Modal de Planes */}
      <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
        <DialogContent className="mx-auto max-w-md rounded-none border border-[#FFC21A]/20 bg-white p-8 text-[#0A0A0A] shadow-lg">
          <DialogHeader>
            <DialogTitle className="mb-2 text-2xl font-black uppercase">
              Elige tu plan de suscripción
            </DialogTitle>
            <DialogDescription className="mb-6 text-[#6B6B68]">
              Selecciona el plan que mejor se adapte a tus necesidades de
              entrenamiento.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6">
            {membershipPlans.map((plan) => (
              <Button
                key={plan.id || plan.name}
                className="h-auto rounded-none bg-[#FFC21A] px-4 py-3 text-left text-sm font-bold text-[#0A0A0A] hover:bg-[#E5A800]"
                onClick={() =>
                  handlePlanSelection({
                    amount: getPlanAmountCents(plan),
                    description: getPlanDescription(plan),
                  })
                }
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span>
                    {plan.name} - S/{Number(plan.price || 0).toFixed(2)}
                  </span>
                  <span className="text-xs font-black uppercase opacity-70">
                    {formatPlanDuration(plan)}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ToastContainer />
    </div>
  );
}
