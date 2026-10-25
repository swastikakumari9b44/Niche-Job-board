import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: { default: "NicheHire - Niche Job Board & ATS", template: "%s | NicheHire" },
  description: "Find specialised roles in AI/ML, Web3, Healthcare, Cybersecurity and more, and manage applicants with built-in tracking.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
