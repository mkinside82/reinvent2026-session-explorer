# re:Invent 2026 Session Explorer — アプリガイド

[English version](README.md)

このガイドではアプリの起動と連携方法を説明します。プロジェクト概要と簡易プレビューは[リポジトリのREADME](../README.md)を参照してください。

## macOSで起動

### Demoプレビュー

Node.jsが必要です。このディレクトリで架空のサンプルカタログをビルドして起動します。

```sh
npm run build
npm run demo
```

ターミナルに表示されたlocalhostのURLを開きます。終了するときは`Ctrl-C`を押してください。Demoではサインインせず、AWSやGoogleのAPIも呼び出しません。

### Liveアプリ

LiveモードにはmacOS、Rust、Cargoが必要です。

```sh
./reinvent-explorer start
./reinvent-explorer status
./reinvent-explorer diagnostics
./reinvent-explorer stop
```

初回起動時にローカルRustサーバーをビルドし、アプリのURLを表示します。ブラウザーで**Builder ID sign-in**を選んでください。AWS re:Inventに登録した参加者アカウントが必要です。AWS OAuthはAuthorization CodeとPKCE、localhostコールバックを使用します。アクセストークンはプロセスのメモリに置き、リフレッシュトークンはmacOS Keychainに保存します。クライアントシークレットは使わず、Keychainに保存できない場合も平文保存へ切り替えません。

Liveモードでは参加者本人のAWS Eventsカタログを読み込みます。起動時にAWS Scheduleの予約済みセッション・お気に入り・個人予定をバックグラウンドで取得します。予約済みセッションと個人予定はMy PlanのTimeline / Listに統合表示され、お気に入りは専用タブで絞り込めます。お気に入りは予定に自動追加されず、カードから選んでMy Planに追加できます。AWS個人予定は読み取り専用で、UTC時刻から会場時刻に変換して表示します。Schedule取得中も検索などは使え、失敗時は表示中の情報を保持して再取得できます。手動候補はブラウザー内のローカルデータで、追加しても座席予約にはなりません。予約は内容を確認した最大10件を1回のリクエストで送信し、結果をセッションごとに表示します。AWS Scheduleから既存予約を最大10件選んで解除でき、取消APIは1件ずつ実行してからScheduleを再読込します。予約と取消はAWSの受付時間により拒否されることがあります。実アカウントでの予約・取消フローは未検証です。

## Google Calendar（任意）

Google Calendar同期はAWS予約とは別機能です。利用者が設定するまで無効です。

1. 自分が管理するGoogle CloudプロジェクトでCalendar APIを有効にし、OAuthクライアントの種類を**Desktop app**として作成します。
2. Liveアプリの**Google設定**でクライアントIDを入力します。IDはmacOS Keychainに保存されます。
3. Googleアカウントに接続し、同期するMy Plan項目を選んで、確認画面の内容を確認してから送信します。

アプリは`calendar.app.created`スコープを要求し、専用のセカンダリカレンダーを使います。再同期すると対応付け済みの予定を更新します。My Planから項目を削除しても、Googleの予定は自動では削除されません。この環境ではGoogle OAuth接続とAPIへの書き込みは未検証です。利用には自身のGoogle Cloud設定が必要です。

## データとプライバシー

- DemoとLiveは起動方法で切り替わり、アプリ内にデータソースの切替はありません。Liveで認証や通信に失敗しても、架空のDemoデータへ切り替わりません。
- AWSの認証情報はローカルアプリのプロセスとmacOS Keychainで管理します。ブラウザー保存領域や静的ビルドには保存しません。
- My Planの手動候補は現在のブラウザープロファイルのローカルストレージに保存します。AWS予約済みセッションはAWS Scheduleから読み取り専用で取得します。ICS書き出しと、利用者が選択したGoogle Calendar同期には両方を含められます。
- ローカルサーバーはlocalhostだけで待ち受けます。公開トンネルやネットワークインターフェースへ公開しないでください。
- ICS書き出しは手動取り込み用のファイルを作成する機能で、カレンダーとの継続同期ではありません。

## ビルドとテスト

```sh
npm run build
npm test
```

フロントエンドはNode.js組み込み機能で動作します。Live用サーバーは`server/`にあり、Rust/Cargoが必要です。自動テストやfixtureの結果は、利用者本人のAWS/Googleアカウントを使った実環境確認の代わりにはなりません。

## ライセンス

ソースコードは[MIT License](../LICENSE)で公開します。AWSの商標やAWSから取得するイベント情報には、それぞれの権利者・利用条件が適用されます。
