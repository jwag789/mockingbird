import type { Metadata } from "next";
import Link from "next/link";
import "@tessera/react/fonts.css";
import "@tessera/react/styles.css";
import "./canopy.css";
import "./globals.css";
import { Logo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Mockingbird",
  description: "A mock interviewer that reads your resume and the job description, pushes back on vague answers, and scores you with evidence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-brand="canopy" suppressHydrationWarning>
      <body>
        <Providers>
          <header className="mb-header">
            <Link href="/" className="mb-logo" aria-label="Mockingbird home">
              <Logo height={40} />
            </Link>
            <UserMenu />
          </header>
          <main className="mb-main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
