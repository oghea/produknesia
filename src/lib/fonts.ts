import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";

// Body: Plus Jakarta Sans — by Tokotype, an Indonesian foundry, designed for
// Jakarta. The subject's own typography, not a template pick.
export const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

// Display: Bricolage Grotesque — chunky and characterful at heavy weights,
// used with restraint (headings, wordmark, rank numerals).
export const fontHeading = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-heading",
});
