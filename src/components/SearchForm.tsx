"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";

export function SearchForm({ initialQuery = "" }: { initialQuery?: string }) {
  const t = useTranslations("search");
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        className="h-9 w-32 pl-8 transition-[width] focus:w-52 sm:w-44 sm:focus:w-64"
      />
    </form>
  );
}
