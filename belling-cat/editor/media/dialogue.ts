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

export function writeDialogue(d: Map<string, Line>): string {
  const out: string[] = [];
  for (const [id, line] of d) {
    out.push(`[${id}] ${line.speaker}`.trimEnd());
    out.push(line.text);
    out.push("");
  }
  return out.join("\n");
}
