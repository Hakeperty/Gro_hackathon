#!/usr/bin/env bash
# Scans the repo working tree for secrets and personal data before a push.
# Prints file:line for each finding and exits 1. Otherwise prints "SECRET SCAN OK" and exits 0.
# Skips .git and node_modules. Matched text is never printed, only where it was found.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Known public org numbers that match the personnummer pattern: association and AB.
ALLOWED_ORG_NUMBERS="802547-4522 559442-1769"
# Email domains allowed in the repo (exact or subdomain). Any address starting with noreply@ is allowed too.
ALLOWED_EMAIL_DOMAINS="example.com example.org example.net example grocommunity.se anthropic.com"  # "example" = RFC 2606 reserved TLD (test fixtures)

PAT_ANTHROPIC_KEY='sk-ant-[A-Za-z0-9_-]{10,}'
PAT_GENERIC_KEY="api[_-]?key[[:space:]]*[:=][[:space:]]*[\"'][A-Za-z0-9]{16,}"
PAT_GITHUB_TOKEN='(ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,})'
PAT_PRIVATE_KEY='-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY'
PAT_EMAIL='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
PAT_PERSONNUMMER='(19|20)?[0-9]{6}[-+][0-9]{4}'

findings=0

report() {  # report <file> <line> <message>
  printf '%s:%s: %s\n' "$1" "$2" "$3"
  findings=$((findings + 1))
}

is_allowed_org() {  # is_allowed_org <token>
  local org
  for org in $ALLOWED_ORG_NUMBERS; do
    [ "$1" = "$org" ] && return 0
  done
  return 1
}

is_allowed_email() {  # is_allowed_email <address>
  local lower domain allowed
  lower="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    noreply@*) return 0 ;;
  esac
  domain="${lower#*@}"
  for allowed in $ALLOWED_EMAIL_DOMAINS; do
    case "$domain" in
      "$allowed"|*".$allowed") return 0 ;;
    esac
  done
  return 1
}

# Each line that matches the pattern is one finding with the given label.
check_lines() {  # check_lines <file> <label> <grep-flags> <pattern>
  local file="$1" label="$2" flags="$3" pattern="$4" lineno
  while IFS= read -r lineno; do
    report "$file" "$lineno" "$label"
  done < <(grep -n $flags -e "$pattern" "$file" | cut -d: -f1 || true)
}

scan_file() {  # scan_file <path relative to repo root>
  local file="$1" base hit lineno token

  base="${file##*/}"
  case "$base" in
    .env|.env.*)
      if [ "$base" != ".env.example" ]; then
        report "$file" 0 "env file present (only .env.example may be in the repo)"
      fi
      ;;
  esac

  check_lines "$file" "possible Anthropic API key (sk-ant-...)" -IE "$PAT_ANTHROPIC_KEY"
  check_lines "$file" "possible hard-coded API key (api_key = '...')" -IiE "$PAT_GENERIC_KEY"
  check_lines "$file" "possible GitHub token (ghp_ / github_pat_)" -IE "$PAT_GITHUB_TOKEN"
  check_lines "$file" "private key header" -IE "$PAT_PRIVATE_KEY"

  while IFS= read -r hit; do
    lineno="${hit%%:*}"
    token="${hit#*:}"
    if ! is_allowed_email "$token"; then
      report "$file" "$lineno" "email address outside the allowlist"
    fi
  done < <(grep -noIE -e "$PAT_EMAIL" "$file" || true)

  while IFS= read -r hit; do
    lineno="${hit%%:*}"
    token="${hit#*:}"
    if ! is_allowed_org "$token"; then
      report "$file" "$lineno" "possible Swedish personnummer"
    fi
  done < <(grep -nowIE -e "$PAT_PERSONNUMMER" "$file" || true)

  return 0
}

while IFS= read -r -d '' path; do
  scan_file "${path#./}"
done < <(find . \( -name .git -o -name node_modules \) -prune -o -type f -print0)

if [ "$findings" -gt 0 ]; then
  echo "SECRET SCAN FAILED: $findings finding(s). Fix them before pushing."
  exit 1
fi

echo "SECRET SCAN OK"
exit 0
