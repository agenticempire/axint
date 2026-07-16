# MCP 2026 Compatibility

Axint's hosted MCP endpoint supports both protocol eras:

- legacy initialization for `2025-03-26`, `2025-06-18`, and `2025-11-25`
- stateless discovery and per-request metadata for the `2026-07-28` release
  candidate

The production TypeScript package remains on the supported v1 SDK until the v2
packages and final protocol revision ship. CI separately tests the hosted
endpoint with `@modelcontextprotocol/client@2.0.0-beta.4`.

Modern support includes:

- `server/discover`
- `MCP-Protocol-Version` and `Mcp-Method` headers
- inline protocol/client metadata
- required `resultType: "complete"` result discriminators
- explicit cache lifetime and scope on list responses
- stateless tool, prompt, and resource requests

## Verify production

```bash
npm run mcp:production:check
```

The release workflow refuses to complete if the hosted version, tool manifest,
prompt manifest, legacy protocol, or modern protocol differs from the package
being released.

Authoritative sources:

- [2026-07-28 release candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- [MCP SDK beta announcement](https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/)
- [TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk)
