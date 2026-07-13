 Do this:
  ▎ 1. Use the Vercel MCP tool get_access_to_vercel_url on https://javis-journal-git-ui-desig
  ▎ n-nonmeeeeeeeeeeeeeees-projects.vercel.app/preview/interactive to mint a shareable bypass
  ▎ URL (valid ~23h).
  ▎ 2. Verify it works: curl -s -L -c jar -b jar -o /dev/null -w "%{http_code}
  ▎ %{url_effective}\n" on the returned URL — it should end in 200 at /preview/interactive 
  ▎ (not redirect to sso-api or /login).
  ▎ 3. Give me the final share URL, and tell me its expiry. Remind me the same _vercel_share 
  ▎ cookie then lets me swap the path to /preview or /preview/responsive on the same host.
  ▎
  ▎ If the Vercel MCP tools aren't loaded, load them first via ToolSearch
  ▎ (get_access_to_vercel_url, list_teams, list_deployments). If the ui-design branch alias
  ▎ ever 404s, list the project's deployments to find the current ui-design preview URL and
  ▎ use that instead.