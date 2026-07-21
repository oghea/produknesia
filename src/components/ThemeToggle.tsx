"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const t = useTranslations("nav");
  // null until mounted — the server can't know the theme, so render a
  // stable placeholder first to avoid a hydration mismatch.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private-mode storage failures shouldn't break the toggle.
    }
    setDark(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("theme")}
      onClick={toggle}
      className="cursor-pointer"
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}
