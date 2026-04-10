CREATE OR REPLACE FUNCTION count_registered_group_members(
    p_alliance_id UUID,
    p_line_group_ids TEXT[]
)
RETURNS JSON
LANGUAGE SQL
SECURITY DEFINER
SET search_path = 'public'
AS $$
SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
FROM (
    SELECT
        gid.line_group_id,
        COUNT(DISTINCT mlb.id)::int AS count
    FROM unnest(p_line_group_ids) AS gid(line_group_id)
    LEFT JOIN line_group_members gm
        ON gm.line_group_id = gid.line_group_id
    LEFT JOIN member_line_bindings mlb
        ON mlb.line_user_id = gm.line_user_id
        AND mlb.alliance_id = p_alliance_id
    GROUP BY gid.line_group_id
) t;
$$;
