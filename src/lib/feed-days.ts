const WIB_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayKey(date: Date): string {
  return WIB_DAY.format(date); // en-CA → YYYY-MM-DD
}

export type LaunchDayGroup<T> = {
  key: string;
  kind: "today" | "yesterday" | "date";
  date: Date;
  items: T[];
};

/** Groups feed items by Asia/Jakarta calendar day (newest first); items
 * within a day are sorted by votes. Pure — inject `now` in tests. */
export function groupByLaunchDay<
  T extends { launchedAt: Date | null; voteCount: number },
>(items: T[], now: Date = new Date()): LaunchDayGroup<T>[] {
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(now.getTime() - 24 * 3600 * 1000));

  const map = new Map<string, LaunchDayGroup<T>>();
  for (const item of items) {
    if (!item.launchedAt) continue;
    const key = dayKey(item.launchedAt);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        kind:
          key === todayKey
            ? "today"
            : key === yesterdayKey
              ? "yesterday"
              : "date",
        date: item.launchedAt,
        items: [],
      };
      map.set(key, group);
    }
    group.items.push(item);
  }
  const groups = [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  for (const g of groups) g.items.sort((a, b) => b.voteCount - a.voteCount);
  return groups;
}
