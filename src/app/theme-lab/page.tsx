import { notFound } from "next/navigation";
import { ThemeLab } from "./ThemeLab";
import "./atelier.css";
import "./directions.css";

// A dev-only page for comparing theme directions on real components.
export default function ThemeLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ThemeLab />;
}
