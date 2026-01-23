"""
Copper Mine Rule Service

Business logic for copper mine rules management.

符合 CLAUDE.md 🔴:
- Business logic in Service layer
- No direct database calls (uses Repository)
- Exception handling with proper chaining
"""

from uuid import UUID

from fastapi import HTTPException, status

from src.models.copper_mine import (
    AllowedLevel,
    CopperMineRule,
    CopperMineRuleResponse,
)
from src.repositories.copper_mine_rule_repository import CopperMineRuleRepository


class CopperMineRuleService:
    """Service for copper mine rule operations"""

    def __init__(self, repository: CopperMineRuleRepository | None = None):
        self.repository = repository or CopperMineRuleRepository()

    def _to_response(self, rule: CopperMineRule) -> CopperMineRuleResponse:
        """Convert entity to response model"""
        return CopperMineRuleResponse(
            id=str(rule.id),
            alliance_id=str(rule.alliance_id),
            tier=rule.tier,
            required_merit=rule.required_merit,
            allowed_level=rule.allowed_level,
            created_at=rule.created_at,
            updated_at=rule.updated_at,
        )

    async def get_rules(self, alliance_id: UUID) -> list[CopperMineRuleResponse]:
        """Get all rules for an alliance"""
        rules = await self.repository.get_rules_by_alliance(alliance_id)
        return [self._to_response(r) for r in rules]

    async def create_rule(
        self,
        alliance_id: UUID,
        tier: int,
        required_merit: int,
        allowed_level: AllowedLevel = "both",
    ) -> CopperMineRuleResponse:
        """
        Create a new copper mine rule

        Validates:
        - Tier must be sequential (next available tier)
        - Required merit must be greater than previous tier
        """
        # Get existing rules to validate
        existing_rules = await self.repository.get_rules_by_alliance(alliance_id)
        sorted_rules = sorted(existing_rules, key=lambda r: r.tier)

        # Validate tier is sequential
        expected_tier = len(sorted_rules) + 1
        if tier != expected_tier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tier must be {expected_tier} (sequential)",
            )

        # Validate merit is greater than previous tier
        if sorted_rules:
            prev_merit = sorted_rules[-1].required_merit
            if required_merit <= prev_merit:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Required merit must be greater than {prev_merit}",
                )

        rule = await self.repository.create_rule(
            alliance_id=alliance_id,
            tier=tier,
            required_merit=required_merit,
            allowed_level=allowed_level,
        )

        return self._to_response(rule)

    async def update_rule(
        self,
        rule_id: UUID,
        alliance_id: UUID,
        required_merit: int | None = None,
        allowed_level: AllowedLevel | None = None,
    ) -> CopperMineRuleResponse:
        """
        Update a copper mine rule

        Validates:
        - Required merit must be > previous tier and < next tier
        """
        # Get the rule to update
        existing_rule = await self.repository.get_by_id(rule_id)
        if not existing_rule:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")

        # Validate alliance ownership
        if existing_rule.alliance_id != alliance_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Rule does not belong to this alliance",
            )

        # Validate merit constraints if updating merit
        if required_merit is not None:
            all_rules = await self.repository.get_rules_by_alliance(alliance_id)
            sorted_rules = sorted(all_rules, key=lambda r: r.tier)

            current_tier = existing_rule.tier

            # Find previous tier's merit (min constraint)
            prev_rule = next((r for r in sorted_rules if r.tier == current_tier - 1), None)
            min_merit = prev_rule.required_merit + 1 if prev_rule else 1

            # Find next tier's merit (max constraint)
            next_rule = next((r for r in sorted_rules if r.tier == current_tier + 1), None)
            max_merit = next_rule.required_merit - 1 if next_rule else None

            if required_merit < min_merit:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Required merit must be at least {min_merit}",
                )

            if max_merit is not None and required_merit > max_merit:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Required merit must be at most {max_merit}",
                )

        updated_rule = await self.repository.update_rule(
            rule_id=rule_id,
            required_merit=required_merit,
            allowed_level=allowed_level,
        )

        if not updated_rule:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update rule"
            )

        return self._to_response(updated_rule)

    async def delete_rule(self, rule_id: UUID, alliance_id: UUID) -> bool:
        """
        Delete a copper mine rule

        Note: Only allows deleting the highest tier rule to maintain sequence.
        """
        # Get the rule to delete
        existing_rule = await self.repository.get_by_id(rule_id)
        if not existing_rule:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")

        # Validate alliance ownership
        if existing_rule.alliance_id != alliance_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Rule does not belong to this alliance",
            )

        # Only allow deleting the highest tier
        all_rules = await self.repository.get_rules_by_alliance(alliance_id)
        max_tier = max(r.tier for r in all_rules) if all_rules else 0

        if existing_rule.tier != max_tier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only the highest tier rule can be deleted",
            )

        return await self.repository.delete_rule(rule_id)
