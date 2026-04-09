CREATE OR REPLACE FUNCTION check_liff_notification_eligibility(
    p_line_group_id TEXT,
    p_line_user_id TEXT,
    p_cooldown_minutes INT DEFAULT 30
)
RETURNS JSON
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
SELECT json_build_object(
    'is_bound', EXISTS(
        SELECT 1 FROM line_group_bindings
        WHERE line_group_id = p_line_group_id AND unbound_at IS NULL
    ),
    'is_registered', EXISTS(
        SELECT 1 FROM member_line_bindings
        WHERE line_user_id = p_line_user_id
    ),
    'in_cooldown', EXISTS(
        SELECT 1 FROM line_user_notifications
        WHERE line_group_id = p_line_group_id
          AND line_user_id = '__GROUP__'
          AND sent_at > NOW() - (p_cooldown_minutes || ' minutes')::INTERVAL
    )
);
$$;
