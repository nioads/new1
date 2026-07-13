import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "News Studio",
  description: "RSS news inbox and social content studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
