from collections.abc import Callable
from typing import Any, TypeVar

_F = TypeVar("_F", bound=Callable[..., Any])


class Server:
    name: str

    def __init__(self, name: str) -> None: ...
    def list_tools(self) -> Callable[[_F], _F]: ...
    def call_tool(self) -> Callable[[_F], _F]: ...
    async def connect(self, transport: Any) -> None: ...
    async def __aenter__(self) -> Server: ...
    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: Any,
    ) -> None: ...
