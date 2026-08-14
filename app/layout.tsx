import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./cards.css";
import "./art.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#fdf7f2",
};

export const metadata: Metadata = {
  title: "驾考女武神",
  description: "交规里世界净化战！答题·组牌·点火觉醒的科目一卡牌肉鸽",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }, { url: "/favicon.ico" }],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
