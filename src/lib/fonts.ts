import { DM_Sans, Space_Grotesk } from "next/font/google";

export const fontSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const fontHeading = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
});
