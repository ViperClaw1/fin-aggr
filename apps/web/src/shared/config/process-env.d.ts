// Public build-time variables; Next inlines `process.env.NEXT_PUBLIC_*` into the client bundle.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_DATA_SOURCE?: string;
    readonly NEXT_PUBLIC_FA_SEED?: string;
    readonly NEXT_PUBLIC_MOCK_FAILURE_RATE?: string;
    readonly NEXT_PUBLIC_SITE_URL?: string;
  }
}
