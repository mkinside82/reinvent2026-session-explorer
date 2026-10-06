# AWS re:Invent 2026 Session Explorer

AWS re:Invent 2026のセッションを検索し、会場現地時刻で1日の予定を組み立てるMac向けプランナーです。公式カタログの閲覧性を補い、候補の比較、時間の重なり、空き時間を確認できます。

## Quick Start

画面をまず見たい場合は、認証なしで動くDemoを起動してください。Node.jsだけで実行でき、AWSやGoogleのAPIには接続しません。

```sh
cd app
npm run build
npm run demo
```

ターミナルに表示された `http://127.0.0.1:<port>/` をブラウザーで開きます。終了はターミナルで `Ctrl-C` です。AIに頼むときは、次の文を使えます。

> `QUICKSTART.md`を読んでDemoプレビューだけを起動し、URLを教えてください。AWS/Googleの認証や外部書き込み、テスト、コミット、pushは行わないでください。

詳しいAI向け手順は[QUICKSTART.md](QUICKSTART.md)を参照してください。AWSの実カタログを使うLiveモードはmacOSとRust/Cargoが必要です。アプリ利用ガイドは[日本語版](app/README.ja.md)と[English](app/README.md)を用意しています。

## 画面イメージ

![Demoモードのセッション検索画面。セッション内容は架空のサンプルです。](screenshots/demo-overview.png)

この画像は認証不要のDemoモードで、セッション内容はすべて架空データです。LiveモードではAWSの実カタログが表示されます。

## こんな使い方を想定しています

1. AWS Builder IDでサインインし、実際のre:Inventセッションを検索します。
2. レベル、トピック、登壇者、会場、時間などで絞り込み、詳細画面からAWS公式カタログも確認します。
3. 気になるセッションを **My Plan** に追加し、日ごとのTimelineで重複と空き時間を見ながら予定を組みます。
4. 必要なら候補をICSへ書き出すか、設定したGoogle Calendarへ本人確認後に同期します。

**My Planへの追加はAWSの予約ではありません。** LiveモードではMy PlanからAWS予約対象を最大10件選び、対象確認後に1回の一括送信を行えます。結果はセッションごとに表示し、AWS Scheduleを再読込して照合します。取消は未対応です。AWS Events APIの予約操作は2026年10月8日まで閉じると案内されているため、開始前の実予約確認は行っていません。[AWS Events APIの案内](https://docs.aws.amazon.com/events/latest/devguide/what-is-events-api.html)

## 主な機能

- 実際のAWSセッションカタログをページ末尾まで取得し、タイトル・概要・コード・登壇者・トピックなどを検索
- Level 200以上、日付、時間、形式、会場、Track、Topic、Service、Speakerによる絞り込み
- Sessionsと公式情報を確認したSide eventsの分離表示
- Card / Compact表示、タイトル・時刻順、最大3件の比較
- My PlanのTimeline / List表示、重複検出、空き時間からのセッション検索
- 詳細画面からAWS公式イベントカタログを開く導線
- 日本語 / EnglishのUI切替
- 1回限りのICS書き出し
- オプトインGoogle Calendar連携。専用カレンダーに選択したPlan項目を追加・更新・削除
- 対応ブラウザーでは、ページを開いている間だけ利用できるWebMCP試作（カタログ検索、Plan読取、ローカル衝突確認、Plan編集）

Google Calendar同期はAWS予約との同期ではありません。詳細な設定方法は[アプリガイド（日本語）](app/README.ja.md)を参照してください。

## DemoとLive

- **Demo**: 静的ビルドの架空セッションで画面を確認する開発・プレビュー用モードです。
- **Live**: Mac上のRustローカルサーバーがAWS Events APIからカタログを取得する利用モードです。サインインや通信に失敗した場合、Demoデータへ切り替わることはありません。

## macOSで起動

必要なもの: macOS、Node.js、Rust/Cargo。Live認証ではmacOS Keychainを使います。

```sh
cd app
./reinvent-explorer start
./reinvent-explorer status
./reinvent-explorer diagnostics
./reinvent-explorer stop
```

初回起動時にRustサーバーをビルドし、ブラウザーで開くlocalhost URLを表示します。アプリで **Builder ID sign-in** を選ぶとAWSのサインインへ進みます。AWSアカウントはre:Invent登録済みである必要があります。

Google Calendarを使う場合は、ユーザー自身のGoogle Cloud projectでCalendar APIとDesktop OAuth clientを設定します。client IDはMacのKeychainに保存されます。詳しい手順は[アプリガイド（日本語）](app/README.ja.md)を参照してください。

フロントエンドの静的出力を作る場合:

```sh
cd app
npm run build
```

`app/dist/`はDemo専用の生成物です。RustサーバーのLive機能は含みません。

## データと保存

- AWSアクセストークンはローカルサーバーのメモリに、リフレッシュトークンはmacOS Keychainに置きます。トークンを静的ファイルやブラウザーのLocal Planへ保存しません。
- AWSカタログのキャッシュはMac内のApplication Supportにアカウント別で保存されます。
- My Planはブラウザーの`localStorage`に、AWSアカウントとイベントごとに分けて保存されます。AWSやGoogleには自動送信されません。
- My Planは同じブラウザープロファイル・同じlocalhost originで再利用できます。ブラウザーデータを消去した場合や、localhostのポートが変わった場合は別の保存領域になり、他のブラウザーやMacへも自動移行しません。
- Google Calendarへの変更は、対象予定を確認する画面を経て、利用者が同期・削除を選択した場合だけ送信します。

## 現在の制約

- AWS一括予約はLiveモードで明示確認後に最大10件を送信し、Schedule再読込と個別結果表示を行います。取消は未対応です。My PlanはAWS予約とは別状態です。
- Google Calendarの実アカウント接続とAPI書き込みは、この環境では未検証です。ユーザー自身のOAuth設定が必要です。
- WebMCP試作はブラウザー内だけの機能で、ChatGPTなどから接続できる独立MCPサーバーではありません。AWSカタログやAWSスケジュールへのChatGPT連携には[AWS公式Events MCP](https://docs.aws.amazon.com/events/latest/devguide/mcp-server.html)を利用できます。
- Side eventsは出典を確認できたものだけを掲載します。時刻や申込条件が公式に確認できない場合は未確認のまま表示します。

## リポジトリ構成

- `app/`: Web UI、静的Demo、macOSローカルRustサーバー
- `app/README.ja.md` / `app/README.md`: アプリの利用・開発ガイド（日本語 / English）

## ライセンス

ライセンスは未設定です。公開・再利用の前に、AWS由来コンテンツや依存コンポーネントの利用条件を確認してライセンスを選定してください。
