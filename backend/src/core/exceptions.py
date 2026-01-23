"""
Custom exception classes for the application.

符合 CLAUDE.md 🟡: Domain exceptions in service layer → Global handler converts to HTTP responses
"""


class AppException(Exception):
    """Base exception class for application-specific errors"""

    def __init__(self, message: str, error_code: str | None = None):
        self.message = message
        self.error_code = error_code
        super().__init__(message)


class SeasonQuotaExhaustedError(AppException):
    """
    Raised when season quota is exhausted.

    This exception is used by SeasonQuotaService to indicate that the user's
    trial period has ended and they have no available seasons to activate.
    """

    def __init__(self, message: str = "Season quota exhausted. Please purchase more seasons."):
        super().__init__(message, error_code="SEASON_QUOTA_EXHAUSTED")
