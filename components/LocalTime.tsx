"use client";

import { useEffect, useState } from "react";

const OPTS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

/** A UTC epoch-ms timestamp in the viewer's time zone. The server renders in UTC
 *  (labelled), then the browser swaps in local time after mount. */
export function LocalTime({ ms }: { ms: number }) {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => setLocal(new Date(ms).toLocaleString([], OPTS)), [ms]);
  const iso = new Date(ms).toISOString();
  return (
    <time dateTime={iso} title={iso}>
      {local ?? `${new Date(ms).toLocaleString("en-US", { ...OPTS, timeZone: "UTC" })} UTC`}
    </time>
  );
}
