#!/usr/bin/env bash
# .claude/scripts/activate-profile.sh
# Troca o perfil de plugins ativo. Use antes de abrir cada sessão.
#
# Uso: ./.claude/scripts/activate-profile.sh <profile-name>
# Ex:  ./.claude/scripts/activate-profile.sh session-b-build

set -euo pipefail

PROFILE=${1:-}

if [ -z "$PROFILE" ]; then
  echo "Usage: $0 <profile-name>"
  echo "Available profiles:"
  echo "  - session-a-discovery  (grill-me + spec-kit; Superpowers off)"
  echo "  - session-b-build      (Superpowers: slicing, planning, TDD execution)"
  exit 1
fi

PROFILE_FILE=".claude/profiles/${PROFILE}.json"

if [ ! -f "$PROFILE_FILE" ]; then
  echo "Error: profile not found: $PROFILE_FILE"
  echo "Did you typo the profile name?"
  exit 1
fi

cp "$PROFILE_FILE" .claude/settings.local.json
echo "✓ Active profile: $PROFILE"
echo ""
echo "Now /exit any open Claude Code session and start a fresh one with: claude"
