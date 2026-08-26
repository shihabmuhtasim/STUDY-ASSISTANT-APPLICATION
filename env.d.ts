declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AI?: Ai;
    CLOUDFLARE_AI_MODEL?: string;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
  }
}
