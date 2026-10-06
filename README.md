# AWS re:Invent 2026 Session Explorer

AWS re:Invent 2026のセッションを検索し、会場現地時刻で1日の予定を組み立てるMac向けプランナーです。公式カタログの閲覧性を補い、候補の比較、時間の重なり、空き時間を確認できます。

## このアプリの役割

公式カタログやAWS Eventsアプリの代わりではなく、セッション選びと一日の時間調整をしやすくする補助プランナーです。条件を組み合わせた検索、最大3件の比較、Timelineでの重複・空き時間の確認をひと続きに行えます。空き時間に合うセッションもその場で探せます。予約や最新のイベント情報はAWS公式サービスを確認してください。

## Quick Start

画面をまず見たい場合は、認証なしで動くDemoを起動してください。Node.jsだけで実行でき、AWSやGoogleのAPIには接続しません。

```sh
cd app
npm run build
npm run demo
```

ターミナルに表示された `http://127.0.0.1:<port>/` をブラウザーで開きます。終了はターミナルで `Ctrl-C` です。AIに頼むときは、次の文を使えます。

> `QUICKSTART.md`を読んでDemoプレビューを起動し、URLを教えてください。AWS/Googleへのサインインやデータ書き込みは行わないでください。

詳しいAI向け手順は[QUICKSTART.md](QUICKSTART.md)を参照してください。AWSの実カタログを使うLiveモードはmacOSとRust/Cargoが必要です。アプリ利用ガイドは[日本語版](app/README.ja.md)と[English](app/README.md)を用意しています。

## 画面イメージ

![Demoモードのセッション検索画面。セッション内容は架空のサンプルです。](screenshots/demo-overview.png)

この画像は認証不要のDemoモードで、セッション内容はすべて架空データです。LiveモードではAWSの実カタログが表示されます。

## こんな使い方を想定しています

1. AWS Builder IDでサインインし、実際のre:Inventセッションを検索します。
2. レベル、トピック、登壇者、会場、時間などで絞り込み、詳細画面からAWS公式カタログも確認します。
3. 気になるセッションを **My Plan** に追加し、日ごとのTimelineで重複と空き時間を見ながら予定を組みます。LiveではAWSの予約済みセッションも起動時に非同期で読み込み、同じTimelineに反映します。
4. 必要なら候補をICSへ書き出すか、設定したGoogle Calendarへ本人確認後に同期します。

**My Planへの追加はAWSの予約ではありません。** LiveモードではMy PlanからAWS予約対象を最大10件選び、対象確認後に1回の一括送信を行えます。AWS Scheduleから既存予約を最大10件選んで解除することもできます。解除APIは1件ずつ呼び、送信後にScheduleを再読込して個別結果を表示します。受付状況は変わるため、予約前に[AWS公式カタログ](https://catalog.awsevents.com/)で確認してください。実アカウントでの予約・解除フローは未検証です。

## 主な機能

- 実際のAWSセッションカタログをページ末尾まで取得し、タイトル・概要・コード・登壇者・トピックなどを検索
- Level 200以上、日付、時間、形式、会場、Track、Topic、Service、Speakerによる絞り込み
- Sessionsと公式情報を確認したSide eventsの分離表示
- Card / Compact表示、タイトル・時刻順、最大3件の比較
- My PlanのTimeline / List表示、重複検出、空き時間からのセッション検索
- LiveではAWS Scheduleの予約済みセッションを起動時に非同期で読み込み、Timeline、ICS、任意のGoogle Calendar同期に反映
- AWS公式の注目テーマを根拠付きで紹介し、My Plan候補と重ならないセッションを優先表示
- Liveでは興味分野を選んでおすすめを調整。関心設定はブラウザー内に保存
- 対応するデスクトップChromeでは詳細画面から端末内モデルでセッション概要を日本語翻訳
- 詳細画面からAWS公式イベントカタログを開く導線
- 日本語 / EnglishのUI切替
- 1回限りのICS書き出し
- オプトインGoogle Calendar連携。専用カレンダーに選択したPlan項目を追加・更新・削除
- ローカルstdio MCPサーバー（セッション検索、AWS Schedule読取、重複確認、空き時間に合う候補、Builder IDサインイン開始）
- 対応ブラウザーでは、ページを開いている間だけ利用できるWebMCP試作（My Plan読取・編集など）

Google Calendar同期はAWS予約との同期ではありません。詳細な設定方法は[アプリガイド（日本語）](app/README.ja.md)を参照してください。

## AWS Events APIとMCPの資料

LiveアプリはAWS EventsのREST APIを利用します。APIの全体像、サインイン、セッション一覧、参加者スケジュール、予約操作の公式資料はこちらです。

- [AWS Events API 概要](https://docs.aws.amazon.com/events/latest/devguide/what-is-events-api.html)
- [Builder IDサインインとPKCE](https://docs.aws.amazon.com/events/latest/devguide/auth-signing-in.html)
- [セッション一覧（ListSessions）](https://docs.aws.amazon.com/events/latest/devguide/rest-op-listsessions.html)
- [参加者スケジュール（GetSchedule）](https://docs.aws.amazon.com/events/latest/devguide/rest-op-getschedule.html)
- [個人予定の登録](https://docs.aws.amazon.com/events/latest/devguide/rest-op-createpersonaltime.html)・[更新](https://docs.aws.amazon.com/events/latest/devguide/rest-op-updatepersonaltime.html)・[削除](https://docs.aws.amazon.com/events/latest/devguide/rest-op-deletepersonaltime.html)
- [セッション予約（ReserveSessions）](https://docs.aws.amazon.com/events/latest/devguide/rest-op-reservesessions.html)
- [予約取消（CancelReservation）](https://docs.aws.amazon.com/events/latest/devguide/rest-op-cancelreservation.html)
- [AWS公式 Events MCPサーバー](https://docs.aws.amazon.com/events/latest/devguide/mcp-server.html)

このアプリのLive接続はREST APIを直接呼び出します。`./app/reinvent-explorer mcp`で起動するローカルstdio MCPサーバーは、セッション検索・AWS Schedule読取・時間重複確認に加え、指定日の空き時間に収まる候補を関心分野・注目テーマ・空席情報で並べます。提案はAWS Scheduleの予約と個人予定を使い、Google Calendarやブラウザー内ローカル候補は読みません。ChatGPT WebからはOpenAI Secure MCP Tunnel経由で接続できます。セットアップは[アプリガイド](app/README.ja.md)を参照してください。ブラウザー内WebMCPは別機能で、このタブを開いている間だけMy Plan操作を公開します。AWS公式Events MCPサーバーともそれぞれ別の機能です。

## DemoとLive

- **Demo**: 静的ビルドの架空セッションで画面を確認する開発・プレビュー用モードです。
- **Live**: Mac上のRustローカルサーバーがAWS Events APIからカタログを取得する利用モードです。サインインや通信に失敗した場合、Demoデータへ切り替わることはありません。

LiveモードとGoogle Calendarの設定手順は[アプリガイド（日本語）](app/README.ja.md)を参照してください。

## データと保存

- AWSアクセストークンはローカルサーバーのメモリに、リフレッシュトークンはmacOS Keychainに置きます。トークンを静的ファイルやブラウザーのLocal Planへ保存しません。
- AWSカタログのキャッシュはMac内のApplication Supportにアカウント別で保存されます。
- My Planの手動候補はブラウザーの`localStorage`にAWSアカウントとイベントごとに分けて保存されます。LiveではAWS Scheduleの予約済みセッションと個人予定を非同期で同じ予定表に統合し、お気に入りは専用タブから選べます。個人予定の追加・更新・削除はAWS Scheduleを再読込して照合します。予約情報をAWSへ書き込む操作は明示確認が必要です。
- My Planは同じブラウザープロファイル・同じlocalhost originで再利用できます。ブラウザーデータを消去した場合や、localhostのポートが変わった場合は別の保存領域になり、他のブラウザーやMacへも自動移行しません。
- Google Calendarへの変更は、対象予定を確認する画面を経て、利用者が同期・削除を選択した場合だけ送信します。

## 現在の制約

- AWS一括予約はLiveモードで明示確認後に最大10件を送信し、Schedule再読込と個別結果表示を行います。既存予約の解除も可能ですが、AWS Scheduleに載っている項目だけが対象で、取消APIは1件ずつ呼び出します。予約済み項目はMy Planに取り込み表示しますが、AWS予約とローカル候補の状態は別管理です。
- Google Calendarの実アカウント接続とAPI書き込みは、この環境では未検証です。ユーザー自身のOAuth設定が必要です。
- MCPは読み取り専用で、セッション検索・Schedule読取・重複確認・空き時間提案を提供し、予約や取消はできません。ローカルstdio接続に対応したクライアント、またはSecure MCP Tunnel設定後のChatGPT Webから利用できます。
- Side eventsは出典を確認できたものだけを掲載します。時刻や申込条件が公式に確認できない場合は未確認のまま表示します。

## ライセンス

ソースコードは[MIT License](LICENSE)で公開します。AWSの商標やAWS Eventsから取得するイベント情報には、それぞれの権利者・利用条件が適用されます。
