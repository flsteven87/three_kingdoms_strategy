-- Baseline snapshot of process_payment_webhook_event RPC as it exists in
-- production on 2026-04-08, captured via `pg_get_functiondef` before the
-- 2026-04-09 purchase-level idempotency rewrite. This file is an archival
-- record — do NOT re-apply; the active definition lives in
-- 20260409_process_payment_webhook_event_v2.sql.

CREATE OR REPLACE FUNCTION public.process_payment_webhook_event(
    p_event_id text,
    p_event_type text,
    p_alliance_id uuid,
    p_user_id uuid,
    p_seasons integer,
    p_payload jsonb
)
RETURNS TABLE(status text, available_seasons integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_inserted_rows int;
    v_new_purchased int;
    v_used          int;
BEGIN
    IF p_seasons <= 0 THEN
        RAISE EXCEPTION 'p_seasons must be positive, got %', p_seasons;
    END IF;

    INSERT INTO public.webhook_events (
        event_id, event_type, alliance_id, user_id, seasons_added, payload
    ) VALUES (
        p_event_id, p_event_type, p_alliance_id, p_user_id, p_seasons, p_payload
    )
    ON CONFLICT (event_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

    IF v_inserted_rows = 0 THEN
        SELECT a.purchased_seasons, a.used_seasons
          INTO v_new_purchased, v_used
          FROM public.alliances a
         WHERE a.id = p_alliance_id;

        RETURN QUERY SELECT
            'duplicate'::text,
            GREATEST(0, COALESCE(v_new_purchased, 0) - COALESCE(v_used, 0));
        RETURN;
    END IF;

    UPDATE public.alliances
       SET purchased_seasons = purchased_seasons + p_seasons
     WHERE id = p_alliance_id
    RETURNING purchased_seasons, used_seasons
      INTO v_new_purchased, v_used;

    IF v_new_purchased IS NULL THEN
        RAISE EXCEPTION 'Alliance not found: %', p_alliance_id;
    END IF;

    RETURN QUERY SELECT
        'granted'::text,
        GREATEST(0, v_new_purchased - v_used);
END;
$function$;
