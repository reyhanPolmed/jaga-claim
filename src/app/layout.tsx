import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import logo from "../../logo jaga claim.png";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  icons: { icon: { url: logo.src, type: "image/png" }, apple: logo.src },
  title: "JAGA-CLAIM — Pre-submit Risk Scoring & Review",
  description: "Platform penilaian risiko dan review klaim FKRTL pra-submission BPJS Kesehatan",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${poppins.variable} ${poppins.className}`}>
      <body className={`${poppins.className} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
