# AI Quick Start

このファイルは、AIアシスタントがリポジトリを受け取ったときに安全にプレビューを起動するための手順です。

## Demoプレビューを起動

必要なものはNode.jsだけです。Demoは架空セッションを使う静的画面で、AWSやGoogleへの認証・API書き込みを使いません。

```sh
cd app
npm run build
npm run demo
```

`npm run demo` は `127.0.0.1` の空きポートを自動選択し、ターミナルにURLを表示します。プロセスを止めるときは `Ctrl-C` を押します。

## AIへの依頼例

このリポジトリを開いたAIに、次のように頼んでください。

> `QUICKSTART.md`を読んでDemoプレビューだけを起動してください。起動URLを教えてください。AWS/Googleの認証や外部書き込み、テスト、コミット、pushは行わないでください。

AIがターミナルを使えない場合は、上の3コマンドをターミナルで実行してください。

## Liveモード

LiveはmacOSのRustサーバーがAWS Events APIへ接続します。利用者がLiveを希望したときだけ、AIから起動を提案・実行します。

```sh
./app/reinvent-explorer start
```

AWS Builder IDサインイン、AWS予約送信、Google Calendarへの書き込みは、それぞれ利用者が画面で明示的に操作した場合だけ行います。DemoとLiveはデータ保存領域も分かれています。

詳細は[README](README.md)と[アプリガイド（日本語）](app/README.ja.md)を参照してください。
