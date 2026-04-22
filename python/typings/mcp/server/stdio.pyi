class StdioServerTransport:
    async def __aenter__(self) -> StdioServerTransport: ...
    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: object | None,
    ) -> None: ...
