#!/usr/bin/env bash
# Posts the report of a job as a comment on the pull request, and updates that
# same comment on the next push instead of adding another one.
#
# Every kind of report has its own marker, so the jobs never overwrite each
# other's comment:
#
#   pr-comment.sh <marker> <body-file>
#
# Outside a pull request (or with a read-only token, e.g. on a fork) it says so
# and exits successfully: the report on the run page is the important one.

set -euo pipefail

marker="${1:?usage: pr-comment.sh <marker> <body-file>}"
file="${2:?usage: pr-comment.sh <marker> <body-file>}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"

if [ -z "${PR:-}" ]; then
  echo "not a pull request - the report stays on the run page"
  exit 0
fi

api="repos/${GITHUB_REPOSITORY}/issues/${PR}/comments"

if [ ! -s "$file" ]; then
  echo "no report at $file - nothing to comment"
  exit 0
fi

body="$file.with-marker"
{
  printf '<!-- %s -->\n' "$marker"
  cat "$file"
} > "$body"

# The search is read-only: if it fails (older gh, no permission for the list),
# the report is posted as a new comment instead of not at all.
id="$(gh api "$api" --paginate \
  --jq ".[] | select(.body | startswith(\"<!-- $marker -->\")) | .id" 2>/dev/null | tail -1 || true)"

if [ -n "$id" ] && gh api -X PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${id}" \
     -F "body=@${body}" > /dev/null 2>&1; then
  echo "updated the report comment (${id})"
else
  gh api -X POST "$api" -F "body=@${body}" > /dev/null
  echo "posted the report comment"
fi
