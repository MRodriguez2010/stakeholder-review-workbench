import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#11100d",
};

export const metadata: Metadata = {
  title: "Casa del Patio | Stakeholder Website Review",
  description: "An interactive review copy of the Casa del Patio website for corrections, critiques, and ideas.",
  robots: { index: false, follow: false },

};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
