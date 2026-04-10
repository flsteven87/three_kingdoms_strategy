-- 2026-04-10: Trial auto-convert on purchase.
--
-- Extends v2 with Step 6: after granting purchased seasons, auto-convert
-- any trial season to paid (is_trial=false, used_seasons += 1).
-- This ensures buying N seasons = N usable seasons (trial is not free).
--
-- New return column: trial_converted (boolean)
--
-- Status contract (unchanged):
--   granted            — this event caused the grant (+ possible trial convert)
--   duplicate_event    — same event_id delivered twice
--   duplicate_purchase — sibling event already granted for this checkout_id
--   audit_only         — p_seasons=0, row recorded, no grant

CREATE OR REPLACE FUNCTION public.process_payment_webhook_event(
    p_event_id    text,
    p_event_type  text,
    p_checkout_id text,
    p_order_id    text,
    p_alliance_id uuid,
    p_user_id     uuid,
    p_seasons     integer,
    p_payload     jsonb
)
RETURNS TABLE(status text, available_seasons integer, trial_converted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_inserted_rows   int;
    v_new_purchased   int;
    v_used            int;
    v_trial_converted boolean := false;
BEGIN
    IF p_seasons < 0 THEN
        RAISE EXCEPTION 'p_seasons must be >= 0, got %', p_seasons;
    END IF;
    IF p_checkout_id IS NULL OR p_checkout_id = '' THEN
        RAISE EXCEPTION 'p_checkout_id is required';
    END IF;

    -- Step 1: Claim the event_id slot (retry protection). Always start at
    -- seasons_added = 0; we promote below if this is a granting event.
    INSERT INTO public.webhook_events (
        event_id, event_type, alliance_id, user_id,
        seasons_added, payload, checkout_id, order_id
    ) VALUES (
        p_event_id, p_event_type, p_alliance_id, p_user_id,
        0, p_payload, p_checkout_id, p_order_id
    )
    ON CONFLICT (event_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

    IF v_inserted_rows = 0 THEN
        -- Same event redelivered. Return current alliance balance.
        SELECT a.purchased_seasons, a.used_seasons
          INTO v_new_purchased, v_used
          FROM public.alliances a
         WHERE a.id = p_alliance_id;

        RETURN QUERY SELECT
            'duplicate_event'::text,
            GREATEST(0, COALESCE(v_new_purchased, 0) - COALESCE(v_used, 0)),
            false;
        RETURN;
    END IF;

    -- Step 2: Audit-only path (checkout.completed). Row recorded; no grant.
    IF p_seasons = 0 THEN
        SELECT a.purchased_seasons, a.used_seasons
          INTO v_new_purchased, v_used
          FROM public.alliances a
         WHERE a.id = p_alliance_id;

        IF v_new_purchased IS NULL THEN
            RAISE EXCEPTION 'Alliance not found: %', p_alliance_id
                USING ERRCODE = 'P0002';
        END IF;

        RETURN QUERY SELECT
            'audit_only'::text,
            GREATEST(0, v_new_purchased - v_used),
            false;
        RETURN;
    END IF;

    -- Step 3: Serialize concurrent siblings for this purchase.
    PERFORM pg_advisory_xact_lock(hashtext(p_checkout_id));

    -- Step 4: Has a sibling already granted for this checkout?
    IF EXISTS (
        SELECT 1
          FROM public.webhook_events
         WHERE checkout_id = p_checkout_id
           AND seasons_added > 0
           AND event_id <> p_event_id
    ) THEN
        SELECT a.purchased_seasons, a.used_seasons
          INTO v_new_purchased, v_used
          FROM public.alliances a
         WHERE a.id = p_alliance_id;

        RETURN QUERY SELECT
            'duplicate_purchase'::text,
            GREATEST(0, COALESCE(v_new_purchased, 0) - COALESCE(v_used, 0)),
            false;
        RETURN;
    END IF;

    -- Step 5: Promote our row + grant. The partial unique index on
    -- (checkout_id) WHERE seasons_added > 0 is the third line of defense —
    -- if we somehow raced past the advisory lock, this UPDATE fails.
    UPDATE public.webhook_events
       SET seasons_added = p_seasons
     WHERE event_id = p_event_id;

    UPDATE public.alliances
       SET purchased_seasons = purchased_seasons + p_seasons
     WHERE id = p_alliance_id
    RETURNING purchased_seasons, used_seasons
      INTO v_new_purchased, v_used;

    IF v_new_purchased IS NULL THEN
        RAISE EXCEPTION 'Alliance not found: %', p_alliance_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Step 6: Auto-convert trial season to paid.
    -- If a trial season exists (activated or completed), convert it:
    --   - Set is_trial = false (permanent access)
    --   - Increment used_seasons (trial now counts against quota)
    -- At most one trial season can exist per alliance (first activation only).
    UPDATE public.seasons
       SET is_trial = false
     WHERE alliance_id = p_alliance_id
       AND is_trial = true
       AND activation_status IN ('activated', 'completed');

    IF FOUND THEN
        v_trial_converted := true;

        UPDATE public.alliances
           SET used_seasons = used_seasons + 1
         WHERE id = p_alliance_id
        RETURNING purchased_seasons, used_seasons
          INTO v_new_purchased, v_used;
    END IF;

    RETURN QUERY SELECT
        'granted'::text,
        GREATEST(0, v_new_purchased - v_used),
        v_trial_converted;
END;
$function$;
