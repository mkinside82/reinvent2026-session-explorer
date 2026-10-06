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

Liveモードでは参加者本人のAWS Eventsカタログを読み込みます。My Planはブラウザー内のローカルデータで、予定に追加しても座席予約にはなりません。予約は内容を確認した最大10件を1回のリクエストで送信し、結果をセッションごとに表示します。予約の取消には対応していません。予約を試す前にAWSの最新の受付状況を確認してください。予約フローの実アカウントでの一連の動作は未検証です。

## Google Calendar（任意）

Google Calendar同期はAWS予約とは別機能です。利用者が設定するまで無効です。

1. 自分が管理するGoogle CloudプロジェクトでCalendar APIを有効にし、OAuthクライアントの種類を**Desktop app**として作成します。
2. Liveアプリの**Google設定**でクライアントIDを入力します。IDはmacOS Keychainに保存されます。
3. Googleアカウントに接続し、同期するMy Plan項目を選んで、確認画面の内容を確認してから送信します。

アプリは`calendar.app.created`スコープを要求し、専用のセカンダリカレンダーを使います。再同期すると対応付け済みの予定を更新します。My Planから項目を削除しても、Googleの予定は自動では削除されません。この環境ではGoogle OAuth接続とAPIへの書き込みは未検証です。利用には自身のGoogle Cloud設定が必要です。

## データとプライバシー

- DemoとLiveは起動方法で切り替わり、アプリ内にデータソースの切替はありません。Liveで認証や通信に失敗しても、架空のDemoデータへ切り替わりません。
- AWSの認証情報はローカルアプリのプロセスとmacOS Keychainで管理します。ブラウザー保存領域や静的ビルドには保存しません。
- My Planは現在のブラウザープロファイルのローカルストレージに保存します。AWSやGoogleへ自動送信しません。
- ローカルサーバーはlocalhostだけで待ち受けます。公開トンネルやネットワークインターフェースへ公開しないでください。
- ICS書き出しは手動取り込み用のファイルを作成する機能で、カレンダーとの継続同期ではありません。

## ビルドとテスト

```sh
npm run build
npm test
```

フロントエンドはNode.js組み込み機能で動作します。Live用サーバーは`server/`にあり、Rust/Cargoが必要です。自動テストやfixtureの結果は、利用者本人のAWS/Googleアカウントを使った実環境確認の代わりにはなりません。
