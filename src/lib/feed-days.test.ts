import { describe, it, expect } from "vitest";
import { groupByLaunchDay } from "./feed-days";

// "now" = 2026-07-21 19:00 UTC = 2026-07-22 02:00 WIB → today(WIB)=2026-07-22
const NOW = new Date("2026-07-21T19:00:00Z");

function item(iso: string, voteCount = 0) {
  return { launchedAt: new Date(iso), voteCount };
}

describe("groupByLaunchDay", () => {
  it("groups by WIB calendar day, not UTC", () => {
    const groups = groupByLaunchDay(
      [
        item("2026-07-21T18:00:00Z"), // 22 Jul 01:00 WIB → today
        item("2026-07-21T10:00:00Z"), // 21 Jul 17:00 WIB → yesterday
        item("2026-07-20T16:59:00Z"), // 20 Jul 23:59 WIB → date
      ],
      NOW,
    );
    expect(groups.map((g) => g.kind)).toEqual(["today", "yesterday", "date"]);
    expect(groups.map((g) => g.key)).toEqual([
      "2026-07-22",
      "2026-07-21",
      "2026-07-20",
    ]);
  });

  it("sorts items within a day by votes and skips null launchedAt", () => {
    const a = item("2026-07-21T18:00:00Z", 5);
    const b = item("2026-07-21T20:00:00Z", 9);
    const groups = groupByLaunchDay(
      [a, b, { launchedAt: null, voteCount: 99 }],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.voteCount)).toEqual([9, 5]);
  });
});
