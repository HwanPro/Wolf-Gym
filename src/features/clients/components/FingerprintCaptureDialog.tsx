"use client";

import Image from "next/image";
import { Check, Fingerprint, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/ui/dialog";

export type FingerprintCapturePhase =
  | "ready"
  | "capturing"
  | "saving"
  | "success";

const phaseCopy: Record<
  FingerprintCapturePhase,
  { title: string; description: string; step: number }
> = {
  ready: {
    title: "Coloca el dedo",
    description: "Apóyalo por completo y mantenlo quieto sobre el lector.",
    step: 1,
  },
  capturing: {
    title: "Capturando huella",
    description: "El lector está obteniendo la plantilla biométrica.",
    step: 2,
  },
  saving: {
    title: "Protegiendo el registro",
    description: "La captura terminó. Estamos guardando la plantilla.",
    step: 3,
  },
  success: {
    title: "Huella registrada",
    description: "El cliente ya puede identificarse en recepción.",
    step: 4,
  },
};

export default function FingerprintCaptureDialog({
  open,
  phase,
  image,
}: {
  open: boolean;
  phase: FingerprintCapturePhase;
  image?: string;
}) {
  const copy = phaseCopy[phase];
  const isBusy = phase === "capturing" || phase === "saving";

  return (
    <Dialog open={open}>
      <DialogContent
        className="wolf-product-theme w-[calc(100vw-1.5rem)] max-w-md border-white/10 bg-zinc-950 p-0 text-zinc-100 [&>button]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-4">
            <div
              className={`relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border ${
                phase === "success"
                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                  : "border-yellow-400/50 bg-yellow-400/10 text-yellow-300"
              }`}
              aria-hidden="true"
            >
              {phase === "success" ? (
                <Check className="h-8 w-8" />
              ) : (
                <Fingerprint className={`h-9 w-9 ${phase === "capturing" ? "animate-pulse" : ""}`} />
              )}
              {phase === "capturing" && (
                <span className="absolute inset-x-2 top-0 h-0.5 animate-[fingerprint-scan_1.35s_ease-in-out_infinite] bg-yellow-300 shadow-[0_0_10px_#fde047]" />
              )}
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-bold uppercase text-yellow-400">
                Registro biométrico · paso {copy.step} de 4
              </p>
              <DialogTitle className="text-xl font-black text-zinc-50">
                {copy.title}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-5 text-zinc-400">
                {copy.description}
              </DialogDescription>
            </div>
          </div>

          {image && phase !== "ready" && (
            <div className="mb-5 grid place-items-center rounded-lg border border-white/10 bg-black/40 p-3">
              <Image
                src={`data:image/bmp;base64,${image}`}
                alt="Vista previa de la huella capturada"
                width={220}
                height={220}
                unoptimized
                className="max-h-44 w-auto rounded-md object-contain"
              />
            </div>
          )}

          <ol className="grid grid-cols-4 gap-2" aria-label="Progreso del registro de huella">
            {["Dedo", "Captura", "Guardado", "Listo"].map((label, index) => {
              const completed = copy.step > index + 1 || phase === "success";
              const current = copy.step === index + 1 && phase !== "success";
              return (
                <li key={label} className="min-w-0 text-center">
                  <span
                    className={`mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full border text-xs font-bold ${
                      completed
                        ? "border-emerald-400 bg-emerald-400 text-zinc-950"
                        : current
                          ? "border-yellow-400 bg-yellow-400 text-zinc-950"
                          : "border-white/15 bg-zinc-900 text-zinc-500"
                    }`}
                  >
                    {completed ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <span className="block truncate text-[11px] text-zinc-400">{label}</span>
                </li>
              );
            })}
          </ol>

          {isBusy && (
            <div className="mt-5 flex items-center justify-center gap-2 border-t border-white/10 pt-4 text-xs text-zinc-400" role="status">
              <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
              No retires el dedo ni desconectes el lector.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
