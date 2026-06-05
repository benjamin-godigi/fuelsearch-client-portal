/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_DATA_SOURCE?: "demo" | "supabase";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
