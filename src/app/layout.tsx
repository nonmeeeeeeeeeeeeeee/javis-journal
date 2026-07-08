import type { Metadata } from "next";
import "./globals.css";
import SyncBoot from "@/components/SyncBoot";

export const metadata: Metadata = {
  title: "Javi's Journal",
  description: "A little scrapbook journal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="pastel">
      <body>
        <SyncBoot />
        {children}
      </body>
    </html>
  );
}
