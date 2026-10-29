import { Transform } from "stream";

/**
 * A stream that passes a SQL dump through line by line, letting `edit`
 * change or drop each line (return null to drop it). Works on latin1 so every
 * byte survives unchanged — dumps can contain binary data that isn't valid
 * UTF-8, and a UTF-8 round trip would corrupt it.
 */
export function editLines(edit: (line: string) => string | null): Transform {
  let buffered = "";
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      buffered += chunk.toString("latin1");
      const lines = buffered.split("\n");
      // The last piece may be an incomplete line — wait for the rest.
      buffered = lines.pop() ?? "";
      const out: string[] = [];
      for (const line of lines) {
        const edited = edit(line);
        if (edited !== null) out.push(edited);
      }
      cb(null, out.length ? Buffer.from(out.join("\n") + "\n", "latin1") : undefined);
    },
    flush(cb) {
      const edited = buffered ? edit(buffered) : null;
      cb(null, edited !== null ? Buffer.from(edited, "latin1") : undefined);
    },
  });
}
