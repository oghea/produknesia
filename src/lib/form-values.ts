// React 19 resets uncontrolled form fields after EVERY form action —
// including failed ones. Actions echo the typed values back in their state
// so the form can repopulate via defaultValue instead of wiping user input.

export type SubmitValues = {
  name?: string;
  taglineId?: string;
  taglineEn?: string;
  descriptionId?: string;
  descriptionEn?: string;
  websiteUrl?: string;
  categoryIds?: string[];
  note?: string;
};

export type UpdateValues = {
  version?: string;
  titleId?: string;
  titleEn?: string;
  bodyId?: string;
  bodyEn?: string;
};

function text(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" && v !== "" ? v : undefined;
}

export function submittedProductValues(formData: FormData): SubmitValues {
  return {
    name: text(formData, "name"),
    taglineId: text(formData, "taglineId"),
    taglineEn: text(formData, "taglineEn"),
    descriptionId: text(formData, "descriptionId"),
    descriptionEn: text(formData, "descriptionEn"),
    websiteUrl: text(formData, "websiteUrl"),
    categoryIds: formData.getAll("categoryIds").map(String),
    note: text(formData, "note"),
  };
}

export function submittedUpdateValues(formData: FormData): UpdateValues {
  return {
    version: text(formData, "version"),
    titleId: text(formData, "titleId"),
    titleEn: text(formData, "titleEn"),
    bodyId: text(formData, "bodyId"),
    bodyEn: text(formData, "bodyEn"),
  };
}
