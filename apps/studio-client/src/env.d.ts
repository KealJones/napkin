/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `browser` builds the studio with its API in a Worker, for a host with no server. */
  readonly VITE_NAPKIN_HOST?: string;
}
