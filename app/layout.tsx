import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Niche Locator",
  description: "Find US cities where a service niche has high ad value and low organic competition.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
