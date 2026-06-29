import type { Metadata } from "next";

const siteUrl = "https://wolf-gym.com";
const title = "Productos Wolf Gym - Tienda Fitness en Ica";
const description =
  "Compra productos fitness de Wolf Gym en Ica: suplementos, accesorios y articulos deportivos disponibles para clientes y visitantes.";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: `${siteUrl}/products/public`,
  },
  openGraph: {
    title,
    description,
    url: `${siteUrl}/products/public`,
    siteName: "Wolf Gym",
    locale: "es_PE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function PublicProductsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
