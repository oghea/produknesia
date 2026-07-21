/** Pre-launch gate: catalog hidden behind the story landing. */
export function isComingSoon(): boolean {
  return process.env.LAUNCH_MODE === "coming_soon";
}
