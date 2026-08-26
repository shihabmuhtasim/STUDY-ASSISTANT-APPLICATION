declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    GROQ_API_KEY?: string;
    GROQ_MODEL?: string;
    OPENROUTER_API_KEY?: string;
    OPENROUTER_MODEL?: string;
    CLOUDFLARE_ACCOUNT_ID?: string;
    CLOUDFLARE_AI_TOKEN?: string;
    CLOUDFLARE_AI_MODEL?: string;
    AI_PROVIDER_ORDER?: string;
  }
}
