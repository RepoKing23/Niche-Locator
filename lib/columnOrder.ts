/**
 * A saved column order merged with the current columns: unknown keys are dropped, and columns added
 * since the order was saved go back next to the column they follow by default.
 */
export function mergeOrder(saved: string[] | null | undefined, defaults: string[]): string[] {
  if (!saved?.length) return [...defaults];
  const known = new Set(defaults);
  const order = [...new Set(saved)].filter((k) => known.has(k));
  defaults.forEach((k, i) => {
    if (order.includes(k)) return;
    const prev = defaults.slice(0, i).reverse().find((p) => order.includes(p));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, k);
  });
  return order;
}

/** Moves `key` to where `target` is (dropping on a column), or by `offset` places (−1 = left/up). */
export function moveKey(order: string[], key: string, to: { target: string } | { offset: number }): string[] {
  const from = order.indexOf(key);
  if (from < 0) return order;
  const index = "target" in to ? order.indexOf(to.target) : from + to.offset;
  if (index < 0 || index >= order.length || index === from) return order;
  const next = order.filter((k) => k !== key);
  next.splice(index, 0, key);
  return next;
}
