import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BIMEG · Quincenas",
  description: "Carga de horas y quincenas de BIMEG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Nav />
        {children}
        <Toaster theme="light" position="top-center" offset="68px" mobileOffset="68px" />
      </body>
    </html>
  );
}
