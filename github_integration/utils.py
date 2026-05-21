from typing import TypeVar, List

T = TypeVar("T")


def batched(items: List[T], batch_size: int) -> List[List[T]]:
    """Yield successive batches from a list."""
    return [
        items[index : index + batch_size] for index in range(0, len(items), batch_size)
    ]
