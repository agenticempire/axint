from typing import Any

class ToolAnnotations:
    readOnlyHint: bool
    destructiveHint: bool
    idempotentHint: bool
    openWorldHint: bool

    def __init__(
        self,
        *,
        readOnlyHint: bool,
        destructiveHint: bool,
        idempotentHint: bool,
        openWorldHint: bool,
    ) -> None: ...


class Tool:
    name: str
    description: str
    annotations: ToolAnnotations
    inputSchema: dict[str, Any]

    def __init__(
        self,
        *,
        name: str,
        description: str,
        annotations: ToolAnnotations,
        inputSchema: dict[str, Any],
    ) -> None: ...
