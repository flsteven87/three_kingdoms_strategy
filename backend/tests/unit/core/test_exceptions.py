"""
Unit Tests for Core Exception Classes

Covers:
- AppException: construction, message, error_code, inheritance
- SeasonQuotaExhaustedError: default message, fixed error_code, custom message
"""

import pytest

from src.core.exceptions import AppException, SeasonQuotaExhaustedError

# =============================================================================
# TestAppException
# =============================================================================


class TestAppException:
    """Tests for AppException base exception class."""

    def test_stores_message(self):
        """Should store provided message on .message attribute."""
        exc = AppException("something went wrong")

        assert exc.message == "something went wrong"

    def test_stores_error_code(self):
        """Should store provided error_code on .error_code attribute."""
        exc = AppException("something went wrong", error_code="CUSTOM_ERROR")

        assert exc.error_code == "CUSTOM_ERROR"

    def test_error_code_defaults_to_none(self):
        """Should set error_code to None when omitted."""
        exc = AppException("no code provided")

        assert exc.error_code is None

    def test_inherits_from_exception(self):
        """Should be raiseable and catchable as a standard Exception."""
        with pytest.raises(AppException):
            raise AppException("base exception works")

    def test_str_representation_is_message(self):
        """str() should return the message (passed to super().__init__)."""
        exc = AppException("readable message")

        assert str(exc) == "readable message"

    def test_args_contains_message(self):
        """args[0] should contain the message for standard exception chaining."""
        exc = AppException("arg message")

        assert exc.args[0] == "arg message"

    def test_empty_message(self):
        """Should accept an empty string as a valid message."""
        exc = AppException("")

        assert exc.message == ""
        assert str(exc) == ""

    def test_error_code_none_explicit(self):
        """Should accept explicit None for error_code."""
        exc = AppException("msg", error_code=None)

        assert exc.error_code is None


# =============================================================================
# TestSeasonQuotaExhaustedError
# =============================================================================


class TestSeasonQuotaExhaustedError:
    """Tests for SeasonQuotaExhaustedError domain exception."""

    def test_default_message(self):
        """Should use the built-in default message when none is provided."""
        exc = SeasonQuotaExhaustedError()

        assert exc.message == "Season quota exhausted. Please purchase more seasons."

    def test_fixed_error_code(self):
        """Should always carry the SEASON_QUOTA_EXHAUSTED error code."""
        exc = SeasonQuotaExhaustedError()

        assert exc.error_code == "SEASON_QUOTA_EXHAUSTED"

    def test_custom_message_overrides_default(self):
        """Should accept a custom message while keeping the fixed error_code."""
        exc = SeasonQuotaExhaustedError("Custom quota message")

        assert exc.message == "Custom quota message"
        assert exc.error_code == "SEASON_QUOTA_EXHAUSTED"

    def test_inherits_from_app_exception(self):
        """Should be an instance of AppException for unified error handling."""
        exc = SeasonQuotaExhaustedError()

        assert isinstance(exc, AppException)

    def test_is_catchable_as_exception(self):
        """Should propagate through standard exception handling."""
        with pytest.raises(SeasonQuotaExhaustedError):
            raise SeasonQuotaExhaustedError()

    def test_catchable_as_app_exception(self):
        """Should be catchable via the AppException base class."""
        with pytest.raises(AppException):
            raise SeasonQuotaExhaustedError()

    def test_str_representation_uses_message(self):
        """str() should reflect the message (inherited via super().__init__)."""
        exc = SeasonQuotaExhaustedError()

        assert "Season quota exhausted" in str(exc)
