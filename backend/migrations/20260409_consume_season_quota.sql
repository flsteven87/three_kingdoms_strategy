-- Atomic consume_season_quota RPC
-- Replaces the check-then-act pattern in SeasonQuotaService.consume_season
-- to close the TOCTOU race window between availability check and increment.
--
-- Logic (single transaction):
--   1. If purchased_seasons > used_seasons → increment used_seasons, return 'paid'
--   2. Else if alliance has zero activated/completed seasons → return 'trial'
--   3. Else → return 'exhausted' (no mutation)
--
-- Returns: { status: 'paid'|'trial'|'exhausted', remaining_seasons: int }

CREATE OR REPLACE FUNCTION consume_season_quota(p_alliance_id UUID)
RETURNS TABLE(status TEXT, remaining_seasons INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_purchased INT;
    v_used      INT;
    v_activated INT;
BEGIN
    -- Lock the alliance row to prevent concurrent consume attempts
    SELECT a.purchased_seasons, a.used_seasons
      INTO v_purchased, v_used
      FROM alliances a
     WHERE a.id = p_alliance_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Alliance not found: %', p_alliance_id;
    END IF;

    -- Path 1: paid seasons available → consume one
    IF v_purchased > v_used THEN
        UPDATE alliances
           SET used_seasons = used_seasons + 1
         WHERE id = p_alliance_id;

        status := 'paid';
        remaining_seasons := v_purchased - (v_used + 1);
        RETURN NEXT;
        RETURN;
    END IF;

    -- Path 2: check trial eligibility (no activated/completed seasons)
    SELECT count(*)::INT
      INTO v_activated
      FROM seasons s
     WHERE s.alliance_id = p_alliance_id
       AND s.activation_status IN ('activated', 'completed');

    IF v_activated = 0 THEN
        status := 'trial';
        remaining_seasons := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Path 3: exhausted
    status := 'exhausted';
    remaining_seasons := 0;
    RETURN NEXT;
    RETURN;
END;
$$;
