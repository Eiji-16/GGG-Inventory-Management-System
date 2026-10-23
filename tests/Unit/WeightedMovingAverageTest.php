<?php

namespace Tests\Unit;

use App\Services\SalesForecastService;
use PHPUnit\Framework\TestCase;

/**
 * Pure math checks for the Weighted Moving Average (weights 1, 2, 3).
 * Numbers can be verified by hand — see the comments on each assertion.
 */
class WeightedMovingAverageTest extends TestCase
{
    private SalesForecastService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new SalesForecastService();
    }

    public function test_wma_weights_the_newest_period_the_most(): void
    {
        // (210×1 + 195×2 + 230×3) ÷ (1+2+3) = 1290 ÷ 6 = 215
        $this->assertEqualsWithDelta(215.0, $this->service->weightedMovingAverage([210, 195, 230]), 0.001);
    }

    public function test_wma_only_uses_the_three_most_recent_periods(): void
    {
        // (10×1 + 20×2 + 40×3) ÷ 6 = 170 ÷ 6 = 28.33 — the old 1000 is ignored
        $this->assertSame(28.3, round($this->service->weightedMovingAverage([1000, 10, 20, 40]), 1));
    }

    public function test_wma_with_less_than_three_periods(): void
    {
        // (10×1 + 40×2) ÷ 3 = 30
        $this->assertEqualsWithDelta(30.0, $this->service->weightedMovingAverage([10, 40]), 0.001);
        $this->assertEqualsWithDelta(30.0, $this->service->weightedMovingAverage([30]), 0.001);
        $this->assertSame(0.0, $this->service->weightedMovingAverage([]));
    }

    public function test_table_shows_weights_past_forecasts_and_variances(): void
    {
        $table = $this->service->buildTable([
            ['periodDate' => '2026-01-01', 'unitsSold' => 218],
            ['periodDate' => '2026-02-01', 'unitsSold' => 195],
            ['periodDate' => '2026-03-01', 'unitsSold' => 230],
            ['periodDate' => '2026-04-01', 'unitsSold' => 198],
            ['periodDate' => '2026-05-01', 'unitsSold' => 246],
        ]);

        // The three newest months carry the weights for the next forecast.
        $this->assertSame([null, null, 1, 2, 3], array_column($table['rows'], 'weight'));
        // First three months have no earlier data to forecast from.
        $this->assertSame([null, null, null], array_slice(array_column($table['rows'], 'wmaForecast'), 0, 3));
        // April: (218×1 + 195×2 + 230×3) ÷ 6 = 216.3; variance 198 − 216.3 = −18.3
        $this->assertSame(216.3, $table['rows'][3]['wmaForecast']);
        $this->assertSame(-18.3, $table['rows'][3]['variance']);
        // May: (195×1 + 230×2 + 198×3) ÷ 6 = 208.2; variance 246 − 208.2 = 37.8
        $this->assertSame(208.2, $table['rows'][4]['wmaForecast']);
        $this->assertSame(37.8, $table['rows'][4]['variance']);
        // June (next): (230×1 + 198×2 + 246×3) ÷ 6 = 227.3
        $this->assertSame(227.3, $table['nextForecast']);
        $this->assertSame(5, $table['dataPoints']);
        // Average size of the error: (18.3 + 37.8) ÷ 2 = 28.05 → 28.1
        $this->assertSame(28.1, $table['meanAbsoluteDeviation']);
    }

    public function test_empty_history_produces_an_empty_table(): void
    {
        $table = $this->service->buildTable([]);

        $this->assertSame([], $table['rows']);
        $this->assertSame(0, $table['dataPoints']);
        $this->assertNull($table['nextForecast']);
    }

    public function test_confidence_levels(): void
    {
        $this->assertSame('Low', $this->service->confidenceFor(2));
        $this->assertSame('Medium', $this->service->confidenceFor(3));
        $this->assertSame('Medium', $this->service->confidenceFor(5));
        $this->assertSame('High', $this->service->confidenceFor(6));
    }
}
