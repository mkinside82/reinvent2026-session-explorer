# AI Quick Start

このファイルは、AIアシスタントがリポジトリを受け取ったときに安全にプレビューを起動するための手順です。

## サンプルデータのプレビューを起動

Node.jsとpnpmが必要です。プレビューは架空セッションを使う静的画面で、AWS認証やAPI書き込みを使いません。

```sh
pnpm install
pnpm build
pnpm demo
```

`pnpm demo` は `127.0.0.1` の空きポートを自動選択し、ターミナルにURLを表示します。プロセスを止めるときは `Ctrl-C` を押します。

## AIへの依頼例

このリポジトリを開いたAIに、次のように頼んでください。

> `QUICKSTART.md`を読んでサンプルデータのプレビューを起動し、URLを教えてください。AWSにはサインインせず、データの書き込みも行わないでください。

AIがターミナルを使えない場合は、上の3コマンドをターミナルで実行してください。

## AWS接続（実データ）

AWS接続ではmacOSのRustサーバーがAWS Events APIへ接続します。利用者が実データの利用を希望したときだけ、AIから起動を提案・実行します。

Rust/Cargoが未導入なら、公式の[rustupインストールガイド](https://rust-lang.org/install.html)に従ってください。macOSでは次のコマンドでRustとCargoをまとめて導入できます。

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

インストール後にターミナルを開き直し、`rustc --version`と`cargo --version`で確認します。初回ビルドでリンカーまたはCコンパイラーのエラーが出た場合は、Xcode Command Line Toolsを追加します。

```sh
xcode-select --install
```

詳細は[READMEのAWS接続セクション](README.md#aws接続実データ)を参照してください。

```sh
./app/reinvent-explorer start
```

AWS Builder IDサインイン、AWS予約送信は、それぞれ利用者が画面で明示的に操作した場合だけ行います。プレビューとAWS接続ではデータ保存領域も分かれています。

詳細は[README](README.md)と[アプリガイド（日本語）](app/README.ja.md)を参照してください。

## ChatGPT WebからMCPを使う

ChatGPT WebからローカルMCPを使う場合、OpenAI Secure MCP TunnelのTunnel ID、Platform Runtime API key、`tunnel-client`が必要です。準備後は次のコマンドで設定・起動できます。詳細は[アプリガイド](app/README.ja.md)を参照してください。

```sh
./app/reinvent-explorer mcp-tunnel-setup <tunnel_id>
./app/reinvent-explorer mcp-tunnel
```

API keyは環境変数`CONTROL_PLANE_API_KEY`から読み込みます。ソースコード、コマンド履歴、リポジトリに書き込まないでください。トンネル起動中のみChatGPTから利用でき、AWSサインインURLはAWS接続サーバーの動作するMac上で開く必要があります。
