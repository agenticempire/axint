# Axint for Neovim

Use Axint inside Neovim with any MCP-compatible AI plugin (Avante, CodeCompanion, etc.).

## Setup with avante.nvim

```lua
require("avante").setup({
  mcp = {
    servers = {
      axint = {
        command = "npx",
        args = { "-y", "@axintai/compiler@0.3.2", "axint-mcp" },
      },
    },
  },
})
```

## Setup with codecompanion.nvim

```lua
require("codecompanion").setup({
  adapters = {
    mcp = {
      servers = {
        axint = {
          command = "npx",
          args = { "-y", "@axintai/compiler@0.3.2", "axint-mcp" },
        },
      },
    },
  },
})
```

## Generic MCP (any plugin)

Any Neovim plugin that spawns an MCP server over stdio can connect using:

```
npx -y @axintai/compiler@0.3.2 axint-mcp
```
