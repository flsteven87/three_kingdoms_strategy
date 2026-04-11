-- Scalar lookup for auth.users by email.
-- Replaces paginated admin.list_users() in AllianceCollaboratorService.
-- Case-insensitive; returns NULL if no match.
--
-- CLAUDE.md 🔴: SECURITY DEFINER + SET search_path = 'public'.
-- auth.users is fully qualified so the pinned search_path is fine.
CREATE OR REPLACE FUNCTION find_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
    SELECT id
    FROM auth.users
    WHERE LOWER(email) = LOWER(p_email)
    LIMIT 1;
$$;

-- Lock down execute permission. Backend uses service_role which bypasses
-- GRANT checks anyway; explicitly revoking from anon/authenticated
-- prevents accidental exposure via PostgREST.
REVOKE ALL ON FUNCTION find_user_id_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION find_user_id_by_email(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION find_user_id_by_email(TEXT) TO service_role;
