import "./globals.css";
import { Manrope, Bricolage_Grotesque } from "next/font/google";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
import AuthProvider from "@/components/AuthProvider";
import ToastProvider from "@/components/ToastProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: { default: "NicheHire - Niche Job Board & ATS", template: "%s | NicheHire" },
  description: "Find specialised roles in AI/ML, Web3, Healthcare, Cybersecurity and more, and manage applicants with built-in tracking.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`h-full ${manrope.variable}`}>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <ToastProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
