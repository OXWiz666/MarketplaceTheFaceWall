import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketday — Find good things nearby",
  description: "A friendly local marketplace to discover and sell pre-loved finds.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
