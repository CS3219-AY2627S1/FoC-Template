# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5), date: 2026-11-04
#   2026-11-04: Shared proxy headers for the frontend nginx config, so the six proxied
#     locations cannot drift apart.
#     No requirements, architecture, schema, or API decisions were made by the AI tool.
#   Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

# Host must be forwarded: user-service issues the refresh cookie and order-service's
# Socket.IO handshake both care about the origin the browser actually used.
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
