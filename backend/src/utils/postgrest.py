"""PostgREST query sanitization utilities."""

import re

# PostgreSQL error codes used across repositories and infrastructure
POSTGRES_UNIQUE_VIOLATION = "23505"

_POSTGREST_OPERATOR_RE = re.compile(
    r"\.(eq|neq|gt|lt|gte|lte|like|ilike|is|in|cs|cd|sl|sr|nxl|nxr|adj|ov|fts|plfts|phfts|wfts|not|or|and)\."
)


def sanitize_postgrest_filter_input(query: str) -> str:
    """Sanitize user input for use in PostgREST filter expressions.

    Strips characters and patterns that could inject additional filters:
    - Commas (filter separator in PostgREST)
    - Operator patterns like .eq., .neq., .ilike., etc.
    """
    sanitized = query.replace(",", "")
    return _POSTGREST_OPERATOR_RE.sub("", sanitized)
