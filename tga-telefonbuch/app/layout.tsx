import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";
import { ServiceWorker } from "@/components/ServiceWorker";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "TGA Telefonbuch – Hartmann TGA GmbH",
  description:
    "Das zentrale Telefonbuch unseres Ingenieurbüros. Kontakte, Firmen und Projekte – auch offline.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <StoreProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
            <ServiceWorker />
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
