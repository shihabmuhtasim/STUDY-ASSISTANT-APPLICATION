declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AI?: Ai;
    CLOUDFLARE_AI_MODEL?: string;
    CLOUDFLARE_AI_ENDPOINT?: string;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GEMINI_MODELS?: string;
    USER_DATA_ENCRYPTION_KEY?: string;
    ADMIN_EMAILS?: string;
  }
}
