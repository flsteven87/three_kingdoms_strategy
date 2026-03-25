"""Tests for analytics shared helpers."""

from src.services.analytics._helpers import compute_box_plot_stats, percentile


class TestComputeBoxPlotStats:
    """Test the shared box-plot statistics computation."""

    def test_basic_five_values(self):
        result = compute_box_plot_stats([1.0, 2.0, 3.0, 4.0, 5.0])
        assert result["min"] == 1.0
        assert result["max"] == 5.0
        assert result["median"] == 3.0
        assert result["q1"] == 2.0
        assert result["q3"] == 4.0
        assert result["cv"] > 0

    def test_single_value(self):
        result = compute_box_plot_stats([42.0])
        assert result["min"] == 42.0
        assert result["max"] == 42.0
        assert result["median"] == 42.0
        assert result["cv"] == 0

    def test_two_values(self):
        result = compute_box_plot_stats([10.0, 20.0])
        assert result["min"] == 10.0
        assert result["max"] == 20.0
        assert result["median"] == 15.0

    def test_empty_list(self):
        result = compute_box_plot_stats([])
        assert result["min"] == 0
        assert result["max"] == 0
        assert result["median"] == 0
        assert result["q1"] == 0
        assert result["q3"] == 0
        assert result["cv"] == 0

    def test_all_zeros(self):
        result = compute_box_plot_stats([0.0, 0.0, 0.0])
        assert result["min"] == 0
        assert result["max"] == 0
        assert result["cv"] == 0

    def test_cv_is_coefficient_of_variation(self):
        """CV = stdev / mean"""
        result = compute_box_plot_stats([10.0, 20.0, 30.0])
        # mean = 20, stdev ≈ 10, cv ≈ 0.5
        assert 0.4 < result["cv"] < 0.6

    def test_unsorted_input_is_handled(self):
        """Input does not need to be pre-sorted."""
        result = compute_box_plot_stats([5.0, 1.0, 3.0, 2.0, 4.0])
        assert result["min"] == 1.0
        assert result["max"] == 5.0


class TestPercentile:
    """Sanity checks for the percentile helper."""

    def test_median_of_odd_count(self):
        assert percentile([1.0, 2.0, 3.0], 0.5) == 2.0

    def test_empty_list(self):
        assert percentile([], 0.5) == 0.0

    def test_single_element(self):
        assert percentile([7.0], 0.25) == 7.0
