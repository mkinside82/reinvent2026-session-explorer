# re:Invent 2026 Session Explorer — アプリガイド

[English version](README.md)

このガイドではアプリの起動と連携方法を説明します。プロジェクト概要と簡易プレビューは[リポジトリのREADME](../README.md)を参照してください。

## macOSで起動

### プレビュー（サンプルデータ）

Node.jsとpnpmが必要です。リポジトリのルートでツールをインストールし、架空のサンプルカタログをビルドして起動します。

```sh
pnpm install
pnpm build
pnpm demo
```

ターミナルに表示されたlocalhostのURLを開きます。終了するときは`Ctrl-C`を押してください。プレビューではサインインせず、AWSやGoogleのAPIも呼び出しません。

### AWS接続（実データ）

AWS接続にはmacOS、Rust、Cargoが必要です。Rustが未導入なら、[Rust公式のインストール案内](https://rust-lang.org/install.html)に従ってrustupを導入してください。rustupはRustとCargoをまとめてインストールします。macOSでは次の方法も使えます。

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

インストール後にターミナルを開き直し、`rustc --version`と`cargo --version`で確認します。初回ビルドでリンカーやCコンパイラーが見つからない場合は、Xcode Command Line Toolsを追加します。

```sh
xcode-select --install
```

準備できたら次を実行してください。

```sh
./reinvent-explorer start
./reinvent-explorer status
./reinvent-explorer diagnostics
./reinvent-explorer stop
```

初回起動時にローカルRustサーバーをビルドし、アプリのURLを表示します。ブラウザーで**Builder ID sign-in**を選んでください。AWS re:Inventに登録した参加者アカウントが必要です。AWS OAuthはAuthorization CodeとPKCE、localhostコールバックを使用します。アクセストークンはプロセスのメモリに置き、リフレッシュトークンはmacOS Keychainに保存します。クライアントシークレットは使わず、Keychainに保存できない場合も平文保存へ切り替えません。

セッション詳細にある**日本語訳**は、Translator APIに対応したデスクトップChromeで端末内翻訳を試します。翻訳モデルの初回ダウンロードが発生する場合があります。原文は変更せず、翻訳できない環境ではChrome / Safariのページ翻訳を利用できます。ChromeのTranslator APIはモバイルでは利用できません。

AWS接続時の「今の注目テーマ」には出典と確認日を付け、期限を過ぎたテーマは表示しません。AWS News Blog、Machine Learning Blog、Security Blogの公式RSSをバックグラウンド取得し、6時間のキャッシュ期限後に再取得します。記事タイトル・カテゴリとセッション情報が一致する候補も出典リンク付きで提案します。取得失敗時は以前の取得内容と手動確認済みテーマを維持します。さらに興味分野を選ぶと、その設定をこのブラウザーに保存し、該当セッションをMy Planとの重複状況とともに優先表示します。

AWS接続時は参加者本人のAWS Eventsカタログを読み込みます。起動時にAWS Scheduleの予約済みセッション・お気に入り・個人予定をバックグラウンドで取得します。予約済みセッションと個人予定はMy PlanのTimeline / Listに統合表示され、お気に入りは専用タブで絞り込めます。セッションカードや詳細からお気に入りを個別に登録・解除でき、My PlanのAWSセッションは最大10件ずつ一括登録できます。お気に入りは関心の記録であり、予約ではありません。予約済みセッションと同様にAWS Scheduleを再読込して結果を照合します。お気に入りは予定に自動追加されず、カードから選んでMy Planに追加できます。個人予定はMy PlanからAWS Scheduleへ追加・編集・削除でき、UTC時刻から会場時刻に変換して表示します。書き込み後はAWS Scheduleを再読込して結果を照合します。Schedule取得中も検索などは使え、失敗時は表示中の情報を保持して再取得できます。手動候補はブラウザー内のローカルデータで、追加しても座席予約にはなりません。予約は内容を確認した最大10件を1回のリクエストで送信し、結果をセッションごとに表示します。AWS Scheduleから既存予約を最大10件選んで解除でき、取消APIは1件ずつ実行してからScheduleを再読込します。予約と取消はAWSの受付時間により拒否されることがあります。AWSの個人予定・予約・取消・お気に入り登録は実アカウントで未検証です。

ログイン後のヘッダーにある**Builder IDを切り替え**から、サインアウト範囲を選べます。**アプリだけからサインアウト**するとアプリのAWSトークンを消し、ブラウザーのBuilder IDセッションは残します。**Builder IDもサインアウト**すると、このブラウザーのBuilder IDセッションも終了し、別のIDでログインできます。

### AIクライアント用ローカルMCP

`./reinvent-explorer mcp`はstdio MCPサーバーを起動し、必要ならAWS接続用ローカルサーバーも開始します。セッション検索、AWS Schedule読取、時間重複確認に加え、`recommend_sessions_for_gaps`で指定日の空き時間に収まる候補を関心分野・確認済みテーマ・AWSの空席情報・取得済みAWS公式ブログ記事で並べられます。RSSは同じローカルAPIが管理する6時間キャッシュです。時刻は会場現地時間（ラスベガス）です。候補はAWSの予約済みセッションと個人予定から計算し、カタログが未取得・未完了の場合や予約の時刻を特定できない場合は警告を返します。Google Calendarやブラウザー内だけのローカル候補は読みません。提案・検索・Schedule読取はいずれも読み取り専用で、予約・取消・個人予定の変更ツールは公開していません。

例: `recommend_sessions_for_gaps`に`date: "2026-12-01"`と`interests: ["ai", "genai"]`を渡すと、その日の08:00–20:00（会場現地時間）を既定の範囲として候補を返します。`dayStart` / `dayEnd`で範囲、`perSlotLimit`で空き枠ごとの候補数を指定できます。関心分野IDは`ai`, `genai`, `architecture`, `serverless`, `containers`, `security`, `database`, `saas`, `developer-tools`です。

ローカルMCPクライアントではcommandにこのリポジトリの`app/reinvent-explorer`、argsに`mcp`を指定してください。ChatGPT WebはOpenAI Secure MCP Tunnel経由で接続できます。OpenAI PlatformでTunnelを作成し、利用するChatGPT workspaceに関連付けてください。PlatformのTunnel設定画面で`tunnel-client`を入手し、Runtime API keyを`CONTROL_PLANE_API_KEY`環境変数として安全に設定した後、次を実行します。

```sh
./app/reinvent-explorer mcp-tunnel-setup <tunnel_id>
./app/reinvent-explorer mcp-tunnel
```

トンネルを使う間は`mcp-tunnel`を起動したままにします。ChatGPT WebのPlugins / AppsからカスタムMCPサーバーを追加し、ConnectionでTunnelを選んで同じTunnelを指定してください。ChatGPT側でカスタムMCPサーバーを追加できる権限も必要です。詳細は[OpenAI Secure MCP Tunnel公式手順](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)を参照してください。Tunnel IDやAPI keyはリポジトリに保存しません。OpenAIトンネルはChatGPTへの中継であり、ローカルAWSサインインのコールバックを転送しません。未サインインなら`begin_aws_sign_in`が認証URLを返すため、AWS接続サーバーを動かしているMac上でURLを開いてください。ブラウザー内WebMCPは別機能です。

## Google Calendar（任意）

Google Calendar同期はAWS予約とは別機能です。利用者が設定するまで無効です。

1. 自分が管理するGoogle CloudプロジェクトでCalendar APIを有効にし、OAuthクライアントの種類を**Desktop app**として作成します。
2. AWS接続アプリの**Google設定**でクライアントIDを入力します。IDはmacOS Keychainに保存されます。
3. Googleアカウントに接続し、同期するMy Plan項目を選んで、確認画面の内容を確認してから送信します。

アプリは`calendar.app.created`スコープを要求し、専用のセカンダリカレンダーを使います。再同期すると対応付け済みの予定を更新します。My Planから項目を削除しても、Googleの予定は自動では削除されません。この環境ではGoogle OAuth接続とAPIへの書き込みは未検証です。利用には自身のGoogle Cloud設定が必要です。

## データとプライバシー

- プレビューとAWS接続は起動方法で切り替わり、アプリ内にデータソースの切替はありません。AWS接続で認証や通信に失敗しても、架空のサンプルデータへ切り替わりません。
- AWSの認証情報はローカルアプリのプロセスとmacOS Keychainで管理します。ブラウザー保存領域や静的ビルドには保存しません。
- My Planの手動候補は現在のブラウザープロファイルのローカルストレージに保存します。AWS予約済みセッションはAWS Scheduleから読み込み、個人予定はアプリから追加・編集・削除できます。ICS書き出しと、利用者が選択したGoogle Calendar同期には両方を含められます。
- ローカルサーバーはlocalhostだけで待ち受けます。公開トンネルやネットワークインターフェースへ公開しないでください。
- ICS書き出しは手動取り込み用のファイルを作成する機能で、カレンダーとの継続同期ではありません。

## ビルドとテスト

```sh
pnpm --dir app run build
pnpm test
```

フロントエンドはNode.js組み込み機能で動作します。AWS接続用サーバーは`server/`にあり、Rust/Cargoが必要です。自動テストやfixtureの結果は、利用者本人のAWS/Googleアカウントを使った実環境確認の代わりにはなりません。

## ライセンス

ソースコードは[MIT License](../LICENSE)で公開します。AWSの商標やAWSから取得するイベント情報には、それぞれの権利者・利用条件が適用されます。
