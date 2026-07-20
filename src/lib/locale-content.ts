type LocalizedRow = {
  taglineId: string | null;
  taglineEn: string | null;
  descriptionId: string | null;
  descriptionEn: string | null;
};

export function pickLocalized(row: LocalizedRow, locale: string) {
  const id = locale === "id";
  return {
    tagline: (id ? row.taglineId : row.taglineEn) ?? (id ? row.taglineEn : row.taglineId),
    description:
      (id ? row.descriptionId : row.descriptionEn) ??
      (id ? row.descriptionEn : row.descriptionId),
  };
}
