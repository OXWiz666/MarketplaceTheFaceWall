import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TheFaceWall Marketplace — Find good things nearby",
  description: "TheFaceWall Marketplace helps neighbors discover and sell pre-loved finds.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
