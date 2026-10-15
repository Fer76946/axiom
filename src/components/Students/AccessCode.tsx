import { useState } from "react";

// Parents key this control by code so a reset always starts hidden.
export default function AccessCode({ code, studentName }: { code: string; studentName: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      type="button"
      className="access-code-toggle"
      aria-label={revealed ? `Hide access code for ${studentName}: ${code}` : `Show access code for ${studentName}`}
      aria-pressed={revealed}
      onClick={() => setRevealed(current => !current)}
    >
      <code>{revealed ? code : "•••••••"}</code>
    </button>
  );
}
