import { slugify } from "./slug";

export function usernameBase(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const fromName = name ? slugify(name) : "";
  if (fromName) return fromName.slice(0, 30);
  const local = email ? email.split("@")[0] : "";
  const fromEmail = slugify(local);
  return (fromEmail || "user").slice(0, 30);
}
