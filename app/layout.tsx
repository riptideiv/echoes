import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Echoes of the Week",
  description: "Blog & LinkedIn post ideas mined from your week",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
