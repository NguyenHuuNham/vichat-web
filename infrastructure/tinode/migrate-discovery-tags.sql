\set ON_ERROR_STOP on

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TEMP TABLE songhong_discovery_tags (
  userid bigint NOT NULL,
  tag varchar(96) NOT NULL,
  PRIMARY KEY (userid, tag)
) ON COMMIT DROP;

WITH identities AS (
  SELECT
    users.id AS userid,
    regexp_replace(auth.uname, '^basic:', '') AS username,
    trim(BOTH '_' FROM regexp_replace(
      lower(unaccent(coalesce(users.public::jsonb ->> 'fn', ''))),
      '[^a-z0-9]+',
      '_',
      'g'
    )) AS normalized_name
  FROM users
  JOIN auth ON auth.userid = users.id AND auth.scheme = 'basic'
), candidates AS (
  SELECT userid, lower(username) AS tag
  FROM identities
  WHERE lower(username) ~ '^[a-z0-9][a-z0-9_.-]{3,23}$'

  UNION ALL

  SELECT userid, left('user_' || trim(BOTH '_' FROM regexp_replace(lower(unaccent(username)), '[^a-z0-9]+', '_', 'g')), 24)
  FROM identities

  UNION ALL

  SELECT userid, left('name_' || normalized_name, 24)
  FROM identities
  WHERE normalized_name <> ''

  UNION ALL

  SELECT identities.userid, left('name_' || name_part, 24)
  FROM identities
  CROSS JOIN LATERAL regexp_split_to_table(identities.normalized_name, '_') AS name_part
  WHERE length(name_part) >= 2
)
INSERT INTO songhong_discovery_tags (userid, tag)
SELECT DISTINCT userid, tag
FROM candidates
WHERE tag ~ '^[a-z0-9][a-z0-9_.-]{3,23}$';

INSERT INTO usertags (userid, tag)
SELECT userid, tag
FROM songhong_discovery_tags
ON CONFLICT (userid, tag) DO NOTHING;

UPDATE users
SET
  tags = coalesce((
    SELECT json_agg(usertags.tag ORDER BY usertags.id)
    FROM usertags
    WHERE usertags.userid = users.id
  ), '[]'::json),
  updatedat = clock_timestamp()
WHERE EXISTS (
  SELECT 1
  FROM songhong_discovery_tags
  WHERE songhong_discovery_tags.userid = users.id
);

COMMIT;

SELECT count(*) AS indexed_users
FROM users
WHERE EXISTS (
  SELECT 1
  FROM usertags
  WHERE usertags.userid = users.id
    AND usertags.tag LIKE 'name_%'
);
