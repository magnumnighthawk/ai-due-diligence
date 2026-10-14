"""Deal context for THIS engagement -- the single place severity thresholds
are parameterised against the deal's own scale, so a rating reflects
materiality *to this deal* rather than a bare, arbitrary percentage.

Illustrative scenario: a mid-market services target with £100-250m
revenue. Swapping to another deal is a config change here, not a
code change in the rules engine.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class DealContext:
    name: str
    currency: str
    revenue_low_m: float   # target revenue band, lower bound (millions)
    revenue_high_m: float  # target revenue band, upper bound (millions)
    # A single-customer revenue concentration becomes material in *money*
    # terms, not as a bare percentage. Severity is derived from the revenue
    # at risk (concentration% x target revenue) against these two bands.
    materiality_high_m: float    # revenue-at-risk at/above this => High
    materiality_medium_m: float  # revenue-at-risk at/above this => at least Medium

    @property
    def revenue_mid_m(self) -> float:
        return (self.revenue_low_m + self.revenue_high_m) / 2

    def revenue_at_risk_m(self, pct_revenue: float) -> float:
        """Illustrative money exposure if a customer at `pct_revenue`% of the
        target's revenue were lost -- computed at the midpoint of the deal's
        revenue band."""
        return pct_revenue / 100.0 * self.revenue_mid_m

    def concentration_severity(self, pct_revenue: float | None) -> str:
        """Severity from a single-customer concentration, scaled to this
        deal. Returns High / Medium / Low. `None` (no figure at all) is
        treated conservatively as Low from concentration alone."""
        if pct_revenue is None:
            return "Low"
        rar = self.revenue_at_risk_m(pct_revenue)
        if rar >= self.materiality_high_m:
            return "High"
        if rar >= self.materiality_medium_m:
            return "Medium"
        return "Low"

    def money(self, millions: float) -> str:
        return f"{self.currency}{millions:.0f}m"


# The active deal. For the £100-250m band, the materiality bands below mean:
#   High   >= £30m revenue-at-risk  (>= ~17.1% of the ~£175m midpoint)
#   Medium >= £10m revenue-at-risk  (>= ~5.7% of the midpoint)
# so a disclosed ">10% of revenue" concentration (~£17.5m at risk) rates
# Medium on its own, and is escalated to High only when compounded by
# additional certain contract factors (see risk_rules).
DEAL = DealContext(
    name="Project mid-market services acquisition",
    currency="£",
    revenue_low_m=100,
    revenue_high_m=250,
    materiality_high_m=30,
    materiality_medium_m=10,
)
