// ★便 ON-3（2026-10-26・0176 ★2 I-1）: 招待トークンの sha256（DB の staff_invites.token_hash／line_bind_tokens.token_hash と同じ encode(sha256(convert_to(token,'UTF8')),'hex')）。サーバ専用（node:crypto）。
import { createHash } from "node:crypto";

export const tokenHashOf = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");
