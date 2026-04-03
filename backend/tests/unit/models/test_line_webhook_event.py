"""Tests for LineWebhookEvent model — joined/left field parsing."""

from src.models.line_binding import LineWebhookEvent


class TestLineWebhookEventJoinedLeft:
    def test_parses_member_joined_event(self):
        """memberJoined event should expose joined user IDs."""
        event = LineWebhookEvent(
            type="memberJoined",
            source={"type": "group", "groupId": "Cgroup123"},
            joined={
                "members": [
                    {"type": "user", "userId": "Uaaa"},
                    {"type": "user", "userId": "Ubbb"},
                ]
            },
            timestamp=1234567890,
        )
        assert event.joined is not None
        assert len(event.joined["members"]) == 2

    def test_parses_member_left_event(self):
        """memberLeft event should expose left user IDs."""
        event = LineWebhookEvent(
            type="memberLeft",
            source={"type": "group", "groupId": "Cgroup123"},
            left={"members": [{"type": "user", "userId": "Uccc"}]},
            timestamp=1234567890,
        )
        assert event.left is not None
        assert event.left["members"][0]["userId"] == "Uccc"

    def test_joined_left_default_to_none(self):
        """Normal message events should have joined=None, left=None."""
        event = LineWebhookEvent(
            type="message",
            source={"type": "group", "groupId": "Cgroup123"},
            message={"type": "text", "text": "hello"},
            timestamp=1234567890,
        )
        assert event.joined is None
        assert event.left is None
