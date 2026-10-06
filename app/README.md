# re:Invent 2026 Session Explorer — App Guide

[日本語版はこちら](README.ja.md)

This guide covers the application itself. For the project overview and quick preview, start with the [repository README](../README.md).

## Run on macOS

### Demo preview

Node.js is required. From this directory, build and serve the fictional sample catalog:

```sh
npm run build
npm run demo
```

Open the loopback URL printed in the terminal and stop the server with `Ctrl-C`. Demo does not sign in or call AWS or Google APIs.

### Live app

Live mode requires macOS, Rust, and Cargo:

```sh
./reinvent-explorer start
./reinvent-explorer status
./reinvent-explorer diagnostics
./reinvent-explorer stop
```

The first start builds the local Rust companion and prints the app URL. Choose **Builder ID sign-in** in the browser. The attendee must have a registered AWS re:Invent account. AWS OAuth uses Authorization Code with PKCE and a loopback callback; the app keeps the access token in process memory and stores the refresh token in macOS Keychain. It does not use a client secret or fall back to plaintext token storage.

Live reads the attendee's AWS Events catalog. My Plan is local browser data and adding an item to it does not reserve a seat. The reservation flow submits a reviewed batch of up to 10 sessions in one request and displays each result. You can select up to 10 existing reservations from AWS Schedule to cancel; cancellation API calls are made one at a time, then Schedule is reloaded for confirmation. AWS may reject reservations and cancellations while the operation is closed. Live reservation and cancellation flows have not been verified with a real account.

## Google Calendar (optional)

Google Calendar sync is separate from AWS reservations and is disabled until configured by the user:

1. In a Google Cloud project you control, enable the Calendar API and create an OAuth client for a **Desktop app**.
2. In the Live app, open **Google settings** and enter the client ID. It is stored in macOS Keychain.
3. Connect your Google account, select the My Plan items to sync, review the confirmation, and submit.

The app requests the `calendar.app.created` scope and manages events in a dedicated secondary calendar. Re-syncing updates mapped events. Removing an item from My Plan does not silently delete its Google event. Actual Google OAuth and API writes require your own project configuration and have not been verified in this environment.

## Data and privacy boundaries

- Demo and Live are selected by how the app is launched; there is no in-app data-source switch. Live failures never fall back to fictional Demo data.
- AWS credentials stay in the local app process and macOS Keychain. They are not stored in browser storage or static build files.
- My Plan is stored in the current browser profile's local storage. It is not sent to AWS or Google automatically.
- The local server binds to loopback. Do not expose it through a public tunnel or network interface.
- ICS export creates a file for manual import; it is not continuous calendar synchronization.

## Build and tests

```sh
npm run build
npm test
```

The frontend uses Node.js built-ins. The Live companion is in `server/` and requires Rust/Cargo. Automated tests and fixture results do not replace verification with the attendee's AWS or Google account.

## License

The source code is licensed under the [MIT License](../LICENSE). AWS trademarks and event information obtained from AWS are subject to their respective owners' terms.
