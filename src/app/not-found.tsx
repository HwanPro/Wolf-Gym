import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="wolf-app wolf-product-theme grid min-h-screen place-items-center bg-zinc-950 p-5 text-zinc-100">
      <section className="w-full max-w-2xl border-y border-white/10 py-10 sm:py-14">
        <div className="mb-8 flex items-center gap-3">
          <Image
            src="/icons/icon-192.png"
            alt="Wolf Gym"
            width={48}
            height={48}
            className="rounded-md"
          />
          <div>
            <p className="text-sm font-bold text-white">Wolf Gym</p>
            <p className="text-xs text-zinc-500">Ica, Perú</p>
          </div>
        </div>

        <p className="mb-3 text-xs font-bold uppercase text-yellow-400">
          Error 404
        </p>
        <h1 className="max-w-xl text-4xl font-black leading-tight text-white sm:text-6xl">
          Esta ruta no existe.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-zinc-400 sm:text-base">
          El enlace puede estar incompleto o la página fue movida. Puedes
          regresar o continuar desde el inicio.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="wolf-button wolf-button-primary justify-center"
          >
            <Home className="h-4 w-4" /> Inicio
          </Link>
          <Link href="/auth/login" className="wolf-button justify-center">
            <ArrowLeft className="h-4 w-4" /> Iniciar sesión
          </Link>
        </div>
      </section>
    </main>
  );
}
