# re:Invent 2026 Session Explorer — App Guide

[日本語版はこちら](README.ja.md)

This guide covers the application itself. For the project overview and quick preview, start with the [repository README](../README.md).

## Run on macOS

### Preview (sample data)

Node.js and pnpm are required. From the repository root, install tools and start the fictional sample catalog:

```sh
pnpm install
pnpm build
pnpm demo
```

Open the loopback URL printed in the terminal and stop the server with `Ctrl-C`. Preview does not sign in or call AWS or Google APIs.

### AWS-connected app (real data)

The AWS-connected app requires macOS, Rust, and Cargo. If Rust is not installed, follow the [official Rust installation guide](https://rust-lang.org/install.html) to install rustup. rustup installs Rust and Cargo together. On macOS, you can also run:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart the terminal after installation and verify with `rustc --version` and `cargo --version`. If the first build reports a missing linker or C compiler, install Xcode Command Line Tools:

```sh
xcode-select --install
```

Then start the app:

```sh
./reinvent-explorer start
./reinvent-explorer status
./reinvent-explorer diagnostics
./reinvent-explorer stop
```

The first start builds the local Rust companion and prints the app URL. Choose **Builder ID sign-in** in the browser. The attendee must have a registered AWS re:Invent account. AWS OAuth uses Authorization Code with PKCE and a loopback callback; the app keeps the access token in process memory and stores the refresh token in macOS Keychain. It does not use a client secret or fall back to plaintext token storage.

The **Translate to Japanese** action in session details uses Chrome's on-device Translator API when available on desktop. Chrome may download a language model the first time. Original text stays unchanged, and Chrome / Safari page translation remains the fallback. Chrome's Translator API is not available on mobile.

Recommendations in the AWS-connected app include source-linked, dated themes that expire automatically. The app also fetches RSS feeds from the official AWS News, Machine Learning, and Security Blogs in the background, with a six-hour cache before another refresh. It suggests sessions only when article titles or categories match session content, and keeps the last successful feed snapshot if refresh fails. You can choose interest areas; matching sessions are ranked with your My Plan conflicts and saved in the current browser.

The AWS-connected app reads the attendee's AWS Events catalog. At startup it reads reserved sessions, favorites, and personal time from AWS Schedule in the background. Reserved sessions and personal time appear in the My Plan Timeline / List without duplicating local picks; favorites appear in a dedicated tab and can be added to My Plan from a card. You can add or remove a favorite from a session card or detail view, and submit up to 10 AWS sessions from My Plan as favorites in one reviewed batch. Favorites record interest only; they do not reserve a seat. Favorites are not added to the plan automatically. You can create, edit, and delete AWS personal-time entries from My Plan; writes are reconciled against a fresh AWS Schedule read. UTC times are converted to venue time. Search and other actions remain usable while Schedule loads; on failure the displayed data is kept and can be refreshed. Local picks stay in browser storage, and adding one does not reserve a seat. The reservation flow submits a reviewed batch of up to 10 sessions in one request and displays each result. You can select up to 10 existing reservations from AWS Schedule to cancel; cancellation API calls are made one at a time, then Schedule is reloaded for confirmation. ICS export and optional Google Calendar sync can include local picks and items imported from AWS Schedule. AWS may reject reservations and cancellations while the operation is closed. AWS personal-time, reservation, cancellation, and favorite writes have not been verified with a real account.

After signing in, choose **Switch Builder ID** in the header to select a sign-out scope. **Sign out of this app only** clears the app's AWS tokens but keeps the browser's Builder ID session. **Also sign out of Builder ID** ends that browser session too, so you can sign in with a different ID.

### Local MCP for AI clients

Run `./reinvent-explorer mcp` to start the stdio MCP server; it starts the AWS-connected companion server if needed. In addition to session search, AWS Schedule reads, and conflict checks, `recommend_sessions_for_gaps` ranks sessions that fit into a specified day's free time by interest, verified themes, AWS seat availability, and the cached official AWS blog feeds. RSS uses a six-hour cache. Times use the Las Vegas venue time zone. Gaps are calculated from AWS reservations and personal-time blocks. The tool reports incomplete catalog coverage and reservations whose times could not be resolved. It does not read Google Calendar or browser-only local picks. All tools remain read-only; no reservation, cancellation, or personal-time write tools are exposed.

Example: call `recommend_sessions_for_gaps` with `date: "2026-12-01"` and `interests: ["ai", "genai"]` to rank candidates between 08:00 and 20:00 venue time. Override `dayStart` / `dayEnd` for another window and `perSlotLimit` for the number of suggestions per gap. Interest IDs: `ai`, `genai`, `architecture`, `serverless`, `containers`, `security`, `database`, `saas`, `developer-tools`.

For a local MCP client, configure the absolute path to `app/reinvent-explorer` as `command` and `mcp` as its argument. ChatGPT Web can connect through OpenAI Secure MCP Tunnel. Create a tunnel in OpenAI Platform and associate it with the target ChatGPT workspace. Download `tunnel-client` from Platform tunnel settings, then set its runtime API key as `CONTROL_PLANE_API_KEY` in the environment and run:

```sh
./app/reinvent-explorer mcp-tunnel-setup <tunnel_id>
./app/reinvent-explorer mcp-tunnel
```

Keep `mcp-tunnel` running while using the connection. In ChatGPT Web, add a custom MCP server under Plugins / Apps and choose the same tunnel under Connection. ChatGPT must allow custom MCP servers for your account or workspace. See the [official Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels). Tunnel IDs and API keys are not stored in this repository. The tunnel only forwards MCP calls; it does not forward the local AWS sign-in callback. If signed out, open the URL returned by `begin_aws_sign_in` on the Mac running the AWS-connected server. Browser WebMCP is a separate feature for working with My Plan in the open tab.

## Side event sources

The side event list combines AWS official experiences with community events listed on [Conference Parties' AWS re:Invent 2026 page](https://conferenceparties.com/reinvent2026/). Conference Parties is unofficial and is not affiliated with or endorsed by AWS. Times and capacity labels from that listing are not organizer-confirmed. Check the source links and each organizer's registration page before attending; event details and availability may change.

## Google Calendar (optional)

Google Calendar sync is separate from AWS reservations and is disabled until configured by the user:

1. In a Google Cloud project you control, enable the Calendar API and create an OAuth client for a **Desktop app**.
2. In the AWS-connected app, open **Google settings** and enter the client ID. It is stored in macOS Keychain.
3. Connect your Google account, select the My Plan items to sync, review the confirmation, and submit.

The app requests the `calendar.app.created` scope and manages events in a dedicated secondary calendar. Re-syncing updates mapped events. Removing an item from My Plan does not silently delete its Google event. Actual Google OAuth and API writes require your own project configuration and have not been verified in this environment.

## Data and privacy boundaries

- Preview and AWS-connected modes are selected by how the app is launched; there is no in-app data-source switch. AWS connection failures never fall back to sample data.
- AWS credentials stay in the local app process and macOS Keychain. They are not stored in browser storage or static build files.
- Local My Plan picks are stored in the current browser profile's local storage. The AWS-connected app reads reservations, favorites, and personal time from AWS Schedule; favorites remain separate until you add a session to My Plan. Personal-time changes are sent to AWS only after an explicit save or delete action.
- The local server binds to loopback. Do not expose it through a public tunnel or network interface.
- ICS export creates a file for manual import; it is not continuous calendar synchronization.

## Build and tests

```sh
pnpm --dir app run build
pnpm test
```

The frontend uses Node.js built-ins. The AWS-connected companion is in `server/` and requires Rust/Cargo. Automated tests and fixture results do not replace verification with the attendee's AWS or Google account.

## License

The source code is licensed under the [MIT License](../LICENSE). AWS trademarks and event information obtained from AWS are subject to their respective owners' terms.
