// Parser/writer for *.dialogue.txt (see FORMAT.md). Mirrors bevy/src/dialogue.rs.

export interface Line {
  speaker: string;
  text: string;
}

export interface Dialogue {
  lines: Map<string, Line>;
  warnings: string[];
}

const HEADER = /^\[([A-Za-z0-9_.]+)\]\s*(.*)$/;

export function parseDialogue(source: string): Dialogue {
  const lines = new Map<string, Line>();
  const warnings: string[] = [];
  let current: { id: string; speaker: string; body: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    if (lines.has(current.id)) warnings.push(`duplicate id ${current.id}; later one wins`);
    lines.set(current.id, { speaker: current.speaker, text: current.body.join("\n").trim() });
    current = null;
  };
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("#")) continue;
    const m = HEADER.exec(line);
    if (m) {
      flush();
      current = { id: m[1], speaker: m[2].trim(), body: [] };
    } else if (line === "") {
      flush();
    } else if (current) {
      current.body.push(line);
    } else {
      warnings.push(`text outside of any [id] block: ${line}`);
    }
  }
  flush();
  return { lines, warnings };
}

/**
 * Replaces the body of block `[id]` in `source` (keeping comments, order and other blocks), or
 * appends a new block when the id does not exist yet.
 */
export function updateDialogueBlock(source: string, id: string, text: string, speaker?: string): string {
  const lines = source.split(/\r?\n/);
  const body = text.replace(/\s+$/, "").split("\n");
  const start = lines.findIndex((l) => {
    const m = HEADER.exec(l.replace(/\s+$/, ""));
    return m && m[1] === id;
  });
  if (start < 0) {
    const out = [...lines];
    while (out.length && out[out.length - 1].trim() === "") out.pop();
    if (out.length) out.push("");
    out.push(`[${id}] ${speaker ?? defaultSpeaker(id)}`.trimEnd(), ...body, "");
    return out.join("\n");
  }
  let end = start + 1;
  while (end < lines.length && lines[end].trim() !== "" && !HEADER.test(lines[end])) end++;
  const header = speaker === undefined ? lines[start] : `[${id}] ${speaker}`.trimEnd();
  return [...lines.slice(0, start), header, ...body, ...lines.slice(end)].join("\n");
}

/** `elder.1` → `elder`; ids without a dot have no speaker. */
export function defaultSpeaker(id: string): string {
  const dot = id.indexOf(".");
  return dot > 0 ? id.slice(0, dot) : "";
}

export function writeDialogue(d: Map<string, Line>): string {
  const out: string[] = [];
  for (const [id, line] of d) {
    out.push(`[${id}] ${line.speaker}`.trimEnd());
    out.push(line.text);
    out.push("");
  }
  return out.join("\n");
}
