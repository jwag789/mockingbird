"use client";

import { ThemeProvider } from "@tessera/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider defaultTheme="system" brand="canopy">{children}</ThemeProvider>;
}
