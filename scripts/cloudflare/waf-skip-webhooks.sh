#!/usr/bin/env bash
# Creates a WAF custom rule that lets webhook deliveries (vast.ai, CryptAPI,
# gateway callbacks) reach /api/webhooks/* on the proxyagent.rent zone.
#
# Why: the zone's Cloudflare protection (managed rules / security level /
# browser integrity check) blocks provider webhook deliveries → 403.
# vast.ai signs deliveries with the X-Vast-Signature-256 HMAC (already verified
# in the app) and publishes no source IP allowlist; CryptAPI delivers via
# 51.77.105.132 / 135.125.112.47 through their proxy — so the skip is
# path-based, not IP-based.
#
# Requires an API token with Zone → WAF (Edit) on proxyagent.rent:
#   dash.cloudflare.com → My Profile → API Tokens → Create token →
#   permission: Zone / WAF / Edit, zone resource: proxyagent.rent
# NOTE: the wrangler OAuth token (~/.config/.wrangler/config/default.toml) only
# has workers scopes (account:read, workers:write) and cannot touch WAF.
#
# Usage:
#   CLOUDFLARE_API_TOKEN=cf_... ./scripts/cloudflare/waf-skip-webhooks.sh
#
# Idempotent: exits early if the rule already exists.

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (Zone → WAF Edit on proxyagent.rent)}"

ZONE_ID="ff42629917f8f4ce16f71273d4dd0cd5" # proxyagent.rent
PHASE="http_request_firewall_custom"       # zone-level WAF custom rules
RULE_DESCRIPTION="Allow webhook deliveries (vast.ai / CryptAPI / gateway)"
EXPRESSION='(http.host eq "proxyagent.rent" and starts_with(http.request.uri.path, "/api/webhooks/"))'

API="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json")

# Rule body: skip everything skippable for webhook paths.
RULE_BODY=$(jq -n \
  --arg desc "$RULE_DESCRIPTION" \
  --arg expr "$EXPRESSION" \
  '{
    rules: [{
      description: $desc,
      expression: $expr,
      action: "skip",
      enabled: true,
      logging: { enabled: true },
      action_parameters: {
        phases: [
          "http_request_firewall_managed",
          "http_ratelimit",
          "http_request_sbfm"
        ],
        products: [
          "securityLevel",
          "bic",
          "uaBlock",
          "hot",
          "zoneLockdown",
          "waf",
          "rateLimit"
        ]
      }
    }]
  }')

echo "Fetching entrypoint ruleset for phase $PHASE..."
ENTRY=$(curl -sS "${auth[@]}" "$API/zones/$ZONE_ID/rulesets/phases/$PHASE/entrypoint")
if ! echo "$ENTRY" | jq -e .success >/dev/null; then
  echo "$ENTRY" | jq .
  echo "-> Cannot read the custom-rule entrypoint (token probably lacks Zone/WAF Edit)." >&2
  exit 1
fi

if echo "$ENTRY" | jq -e --arg d "$RULE_DESCRIPTION" '.result.rules[]? | select(.description == $d)' >/dev/null 2>&1; then
  echo "Rule already exists, nothing to do:"
  echo "$ENTRY" | jq -r '.result.rules[] | "  \(.id)  \(.description)  [enabled=\(.enabled)]"'
  exit 0
fi

RS_ID=$(echo "$ENTRY" | jq -r '.result.id // empty')
if [ -n "$RS_ID" ]; then
  echo "Adding rule to ruleset $RS_ID..."
  RESP=$(curl -sS "${auth[@]}" -X POST "$API/zones/$ZONE_ID/rulesets/$RS_ID/rules" \
    --data "$(echo "$RULE_BODY" | jq '.rules[0]')")
else
  echo "No entrypoint ruleset exists yet; creating one with the rule..."
  PAYLOAD=$(echo "$RULE_BODY" | jq '{name: "zone custom rules", kind: "zone", phase: "http_request_firewall_custom", rules: .rules}')
  RESP=$(curl -sS "${auth[@]}" -X PUT "$API/zones/$ZONE_ID/rulesets/phases/$PHASE/entrypoint" --data "$PAYLOAD")
fi

if echo "$RESP" | jq -e .success >/dev/null; then
  echo "OK. Zone custom rules now:"
  echo "$RESP" | jq -r '.result.rules[] | "  \(.id)  \(.description)  [enabled=\(.enabled)]"'
  echo
  echo "Next: repoint the vast.ai webhook from workers.dev back to the real domain"
  echo "  (webhook #348 currently targets https://proxy-agent.silentoverride.workers.dev/api/webhooks/vast):"
  echo "  curl -X PUT 'https://api.vast.ai/api/v0/webhooks/348/' \\"
  echo "       -H \"Authorization: Bearer \$VAST_API_KEY\" \\"
  echo "       -d '{\"url\": \"https://proxyagent.rent/api/webhooks/vast\"}'"
  echo
  echo "Then test with vast's test delivery (POST https://api.vast.ai/api/v0/webhooks/348/test/)."
else
  echo "API call failed:" >&2
  echo "$RESP" | jq . >&2
  exit 1
fi