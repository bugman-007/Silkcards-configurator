/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARSER_BASE_URL?: string;
  readonly VITE_PARSER_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

