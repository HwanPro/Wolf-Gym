import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "./providers";

const siteUrl = "https://wolf-gym.com";
const siteName = "Wolf Gym";
const iconPath = "/icons/icon-512.png";
const logoPath = iconPath;
const title = "Wolf Gym - Gimnasio en Ica | Entrena con equipos de calidad";
const description =
  "Wolf Gym en Ica: gimnasio con equipos de calidad, planes accesibles, tienda deportiva y control de asistencia para clientes.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: title,
    template: `%s | ${siteName}`,
  },
  description,
  keywords: [
    "gimnasio Ica",
    "Wolf Gym",
    "Wolf Gym Ica",
    "fitness Ica",
    "gym en Ica",
    "entrenamiento personal",
    "membresias gimnasio",
    "membresías gimnasio Ica",
    "gym Ica Perú",
    "tienda fitness Ica",
  ],
  authors: [{ name: "Wolf Gym" }],
  creator: "Wolf Gym",
  publisher: "Wolf Gym",
  category: "Fitness",
  manifest: "/site.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    title,
    description,
    siteName,
    locale: "es_PE",
    url: siteUrl,
    images: [
      {
        url: logoPath,
        width: 512,
        height: 512,
        alt: "Logo de Wolf Gym",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [iconPath],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
  alternates: { canonical: siteUrl },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFC21A",
};

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const localBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "Gym",
    name: "Wolf Gym",
    description,
    url: siteUrl,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Av. Peru 622",
      addressRegion: "Ica",
      postalCode: "11003",
      addressCountry: "PE",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: -14.0678,
      longitude: -75.7286,
    },
    openingHours: ["Mo-Fr 06:00-21:00", "Sa 06:00-20:00"],
    priceRange: "S/60 - S/350",
    image: `${siteUrl}${logoPath}`,
    logo: `${siteUrl}${logoPath}`,
  };

  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh overflow-x-hidden bg-background font-sans text-foreground antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessJsonLd),
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
