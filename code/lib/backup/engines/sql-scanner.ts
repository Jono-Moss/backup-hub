import { Writable } from "stream";
import type { DumpScanner } from "./types";

/**
 * Checks a plain-SQL dump (mysqldump, pg_dump): remembers the last
 * non-empty line — ignoring lines matching `trailer`, which the dump tool
 * may write after its completion marker — and counts CREATE TABLEs. The
 * dump is complete when that last line matches `marker`, the line every
 * finished dump ends with; a dump cut short (tool killed, disk full) won't
 * have it.
 */
export function sqlDumpScanner(marker: RegExp, createTable: RegExp, trailer?: RegExp): DumpScanner {
  let lastLine = "";
  let createTables = 0;
  let bytes = 0;
  let partial = "";

  const take = (line: string) => {
    if (createTable.test(line)) createTables++;
    if (line.trim() && !trailer?.test(line.trim())) lastLine = line;
  };

  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      const lines = (partial + chunk.toString("latin1")).split("\n");
      partial = lines.pop() ?? "";
      lines.forEach(take);
      cb();
    },
    final(cb) {
      if (partial) take(partial);
      cb();
    },
  });

  return {
    sink,
    result() {
      const complete = marker.test(lastLine.trim());
      return {
        complete,
        objects: createTables,
        bytes,
        problem: complete
          ? undefined
          : "it doesn't end with the database tool's \"dump completed\" line, so it was probably cut short",
      };
    },
  };
}
