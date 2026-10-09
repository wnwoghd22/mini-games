// Stable JSON formatting: objects expand one key per line, arrays of numbers stay on one line,
// so git diffs of *.scene.json stay readable after editor edits.

export function formatScene(value: unknown): string {
  return fmt(value, 0) + "\n";
}

function isLeafArray(v: unknown[]): boolean {
  return v.every((x) => typeof x === "number" || typeof x === "string" || typeof x === "boolean");
}

function isShortObject(v: Record<string, unknown>): boolean {
  // Steps, keyframes and children are compact single-line objects when they have no nested objects
  // and no long arrays.
  const vals = Object.values(v);
  if (vals.length > 12) return false;
  return vals.every(
    (x) =>
      x === null ||
      typeof x !== "object" ||
      (Array.isArray(x) && isLeafArray(x) && x.length <= 4) ||
      (!Array.isArray(x) && Object.values(x as object).every((y) => typeof y !== "object"))
  );
}

function fmt(v: unknown, depth: number): string {
  const pad = "  ".repeat(depth);
  const inner = "  ".repeat(depth + 1);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (isLeafArray(v)) return "[" + v.map((x) => JSON.stringify(x)).join(", ") + "]";
    if (v.every((x) => Array.isArray(x) && isLeafArray(x))) {
      // polygon: vertices one per line
      return "[\n" + v.map((x) => inner + fmt(x, depth + 1)).join(",\n") + "\n" + pad + "]";
    }
    return "[\n" + v.map((x) => inner + fmt(x, depth + 1)).join(",\n") + "\n" + pad + "]";
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined);
    if (keys.length === 0) return "{}";
    if (depth >= 2 && isShortObject(o)) {
      return "{ " + keys.map((k) => JSON.stringify(k) + ": " + fmt(o[k], depth + 1)).join(", ") + " }";
    }
    return "{\n" + keys.map((k) => inner + JSON.stringify(k) + ": " + fmt(o[k], depth + 1)).join(",\n") + "\n" + pad + "}";
  }
  return JSON.stringify(v);
}
