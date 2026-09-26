# Frozen Pi web-access contract

Preflight librarian inspected registry metadata and tarball before SDD implementation. Exact selection: pi-web-access@0.27.0.

- Official source: https://github.com/nicobailon/pi-web-access
- Exact tarball: https://registry.npmjs.org/pi-web-access/-/pi-web-access-0.27.0.tgz
- Offline root: C:/Users/EremesNG/AppData/Local/Temp/pi-web-access-contract-6967b154fac649559931689fe925cc9b
- SHA-512 SRI: sha512-D/z7ILwbnJeDjzFPC1j3G1OvO+j2vl2H13ByYcH5FLbrJ1yBdbBwTBcl96Bbt2NEqH5vdmoZ/EpbDG8BTF9W7Q==
- package/package.json: no engines field; peers @earendil-works/pi-ai, pi-coding-agent, pi-tui with wildcard versions; native index.ts extension.
- package/index.ts: web_search (query/queries, provider, workflow none/summary-review/auto-summary); source_check (claim); fetch_content (url/urls, readable/raw/answer); get_search_content (responseId and selection/pagination).
- Default workflow summary-review opens curator. workflow none returns raw results. The no-UI branch forces none unless auto-summary; explicit none is appropriate for child instructions.
- package/exa.ts: EXA_API_KEY/exaApiKey optional; keyless requests use public https://mcp.exa.ai/mcp, keyed requests use Exa endpoints. This is not equivalent to dedicated pi-exa find-similar or stateful research tools.
- Config resolution: PI_CODING_AGENT_DIR/web-search.json, XDG_CONFIG_HOME/pi/web-search.json, otherwise ~/.pi/web-search.json. toolNames can override defaults. Credentials/config remain operator-owned.
- GitHub fetching may clone repositories; full fetched content persists in web-search-cache under Pi config; PDFs/media may create temporary artifacts; answer mode may call a model.
- No network installation or live tool operation was run. Tarball was extracted only. Live provider success remains an operational outcome.
