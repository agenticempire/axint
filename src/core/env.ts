// Three-env setup for the CLI. AXINT_ENV picks the default endpoints; any
// explicit AXINT_REGISTRY_URL still wins so local overrides don't need a
// custom env value.

export type AxintEnv = "dev" | "preview" | "prod";

type Endpoints = {
  registry: string;
};

const endpoints: Record<AxintEnv, Endpoints> = {
  dev: { registry: "http://127.0.0.1:8787" },
  preview: { registry: "https://preview.registry.axint.ai" },
  prod: { registry: "https://registry.axint.ai" },
};

export function resolveEnv(value: string | undefined): AxintEnv {
  const v = value?.toLowerCase();
  if (v === "dev" || v === "preview" || v === "prod") return v;
  return "prod";
}

export function registryBaseUrl(env = resolveEnv(process.env.AXINT_ENV)): string {
  const override = process.env.AXINT_REGISTRY_URL;
  if (override) return override;
  return endpoints[env].registry;
}
