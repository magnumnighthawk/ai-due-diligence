from typing import Literal, Optional

from pydantic import BaseModel, Field


class CustomerConcentration(BaseModel):
    """Financial workstream: a customer's share of revenue as disclosed in the document."""

    customer_name: str = Field(
        description="Customer name exactly as stated. If the document anonymizes the customer "
        "(e.g. 'Customer A'), use that label verbatim -- never guess a real name for it."
    )
    pct_revenue: Optional[float] = Field(
        default=None, description="Exact percentage of revenue, if one is stated (e.g. 41.0 for '41%')."
    )
    pct_revenue_threshold: Optional[str] = Field(
        default=None,
        description="If only a threshold is stated instead of an exact figure (e.g. 'in excess of 10%'), "
        "record it verbatim here and leave pct_revenue null.",
    )
    period: str = Field(description="Fiscal period the figure covers, as stated (e.g. 'year ended December 31, 2022').")
    source_index: int = Field(description="The [N] excerpt number this finding was drawn from.")


class ContractClause(BaseModel):
    """Commercial workstream: a specific clause from a contract exhibit."""

    clause_type: Literal["change_of_control", "assignment", "termination", "exclusivity", "term_expiry"]
    counterparty: str = Field(description="The other party to the agreement, named exactly as stated.")
    summary: str = Field(description="1-3 sentence factual summary of the clause, grounded in the excerpt text.")
    source_index: int = Field(description="The [N] excerpt number this finding was drawn from.")


class PersonnelEvent(BaseModel):
    """Operational workstream: an executive/director departure or appointment."""

    person: str
    role: str
    event_type: Literal["departure", "appointment"]
    date: str = Field(description="Date of the event as stated in the document.")
    source_index: int = Field(description="The [N] excerpt number this finding was drawn from.")


class CustomerConcentrationExtraction(BaseModel):
    findings: list[CustomerConcentration]


class ContractClauseExtraction(BaseModel):
    findings: list[ContractClause]


class PersonnelEventExtraction(BaseModel):
    findings: list[PersonnelEvent]
