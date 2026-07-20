"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

export function SearchForm({ initialQuery = "" }: { initialQuery?: string }) {
  const t = useTranslations("search");
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        if (trimmed) router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("placeholder")}
        className="w-36 rounded-md border border-gray-300 px-3 py-1 text-sm focus:w-56 focus:border-black focus:outline-none sm:w-48 sm:focus:w-64 transition-all"
      />
    </form>
  );
}
