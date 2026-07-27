import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Volopay Hiring Platform",
  description: "Admin and candidate assessment platform for Volopay.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
