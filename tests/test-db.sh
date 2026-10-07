#!/usr/bin/env bash
# The throwaway MySQL the unit suite and the Playwright run expect: database
# `cv_chat_test`, user `chat`, and nothing that survives the container.
#
# Both suites default to 127.0.0.1:3306 (see tests/helpers.mjs), so this makes
# them work with no environment at all - in a Codespace, or on a machine where
# the stack's own MySQL is not reachable from outside (it is not published).
#
#   DB_PORT=3307 npm run db:test:start     # when 3306 is taken
#   npm test                               # then this just works
#   npm run e2e
#
# Usage: test-db.sh [start|stop]

set -euo pipefail

NAME=cv-mysql-test
PORT="${DB_PORT:-3306}"

case "${1:-start}" in
  start)
    docker rm -f "$NAME" > /dev/null 2>&1 || true
    docker run -d --rm --name "$NAME" \
      -e MYSQL_ROOT_PASSWORD=root \
      -e MYSQL_DATABASE=cv_chat_test \
      -e MYSQL_USER=chat \
      -e MYSQL_PASSWORD=chat \
      -p "${PORT}:3306" \
      mysql:8.4 > /dev/null

    printf 'waiting for mysql on 127.0.0.1:%s' "$PORT"
    for _ in $(seq 1 60); do
      if docker exec "$NAME" mysqladmin ping -h 127.0.0.1 --silent > /dev/null 2>&1; then
        printf ' ready\n'
        exit 0
      fi
      printf '.'
      sleep 2
    done

    printf '\nmysql did not become ready in two minutes\n' >&2
    exit 1
    ;;
  stop)
    docker rm -f "$NAME" > /dev/null 2>&1 || true
    echo "test database stopped"
    ;;
  *)
    echo "usage: test-db.sh [start|stop]" >&2
    exit 1
    ;;
esac
