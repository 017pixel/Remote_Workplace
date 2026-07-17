import { z } from "zod";

// Muss vor jedem Zod-Parse (auch in importierten Modulen) gelten, damit Zod
// keine JIT-Kompilierung über `new Function` versucht – sonst verletzt die
// strikte CSP `script-src 'self'` das `eval`-Verbot und loggt eine Violation.
z.config({ jitless: true });
