# SuiseiCloset エージェント向けガイド

この文書は、初めて参加する開発者・エージェント向けの機能概要と開発の入口をまとめる。詳細仕様は現行のソース・設定を参照し、変更時は関連する概要を更新する。パスとコマンドはプロジェクトルートを基準とする。

作業前にGitの状態と対象の差分を確認し、既存の未コミット変更を保持する。文書のみの依頼では実装・設定を変更しない。ルートの `README.md` は人間が管理するため、明示的な依頼がある場合だけ編集する。

## 構成

Vue 3・TypeScriptの画面、Cloudflare Pages FunctionsのAPI、D1のDBで構成する。

- `src/app/`：ルート定義
- `src/features/`：認証・衣装・観測者の画面とAPIクライアント
- `src/shared/`：HTTP通信や画面配置などの共通処理
- `src/server/`：認証・データ取得・保存処理
- `functions/`：Pages Functionsの入口
- `public/`：静的ファイルと第三者ライセンス表示
- `scripts/`：開発補助ツール
- `docs/`：開発ガイド・DB定義・CSV入力例

依存関係とコマンドは `package.json`、型は各機能のモデルと `src/server/types.ts` を参照する。

## 認証

Discord OAuthで認証する。`OAUTH_ENABLED=false` の場合だけ匿名閲覧を許可し、それ以外は登録済みの有効なアカウントでログインする。権限は `member`（閲覧）、`editor`（衣装・資料の管理）、`admin`（観測者管理を含む全機能）の3種類。画面とAPIの両方で権限を確認する。

## 観測者の管理

adminは `/admin/users` で観測者を追加・編集・削除できる。Discord IDと権限を管理し、表示名はDiscordログイン時に取得する。自分自身の権限を失う操作は制限する。実装は `src/features/users/` と `src/server/users/` を参照する。

## 衣装の閲覧・検索

`/costumes` で衣装名・キーワード・カテゴリ・初出年から公開衣装を検索し、詳細画面で資料や関連衣装を確認できる。一覧は初出日の新しい順に表示し、検索条件とページ番号をURLに保持する。表記揺れを吸収した部分一致検索に対応する。一般画面の候補・関連衣装も公開中のものに限定する。

## 衣装の管理

`/admin/costumes` で衣装の登録・編集・削除と公開切り替えを行う。新規衣装は非公開で作成し、基本情報・キーワード・関連衣装・資料を編集する。衣装を削除すると紐づく資料も削除する。

関連衣装はグループとして管理する。初出日は入力を年月日に補完し、有効な日付を保存する。基本情報は画面下の保存バーで保存し、一覧へ戻ると検索条件を復元する。未保存の変更がある場合は離脱時に確認する。

画面は `src/features/costumes/views/AdminCostumeEditView.vue`、入力検証と保存処理は `src/server/costumes/` を参照する。

## 資料の表示と表示順

衣装詳細では、関連資料をタイトル・内容・出典・元資料へのリンク付きで表示する。XとYouTubeは公式ウィジェット、その他は登録された画像とリンクを使用する。一覧・関連衣装のカードにも出典を表示し、名前を取得できない場合はURLを表示する。

資料は保存された順序で、画面幅に応じた列数に並べる。管理画面では資料の追加・行内編集・削除と内容のプレビューができ、ドラッグや上下ボタンで表示順を変更できる。資料の変更は個別保存、表示順は画面下の保存操作で確定する。未保存の入力や並び順がある場合は離脱時に確認する。

表示・編集は `src/features/costumes/`、出典取得と保存処理は `src/server/costumes/` を参照する。

## DBと衣装ID

DBはCloudflare D1を使用する。[DDL](database/DDL.sql) は新規DB用で、既存DBには再実行しない。既存DBの更新には [差分SQL](database/migration/Issue_%231.sql) を使い、適用条件はSQL内の説明を確認する。

衣装IDは `costume-001` 形式の連番で、削除した番号は再利用しない。画面・CSV登録で採番処理を共用する。APIによる変更は監査ログに記録する。

## CSVでの一括登録

[空テンプレート](csv/costumes-import.template.csv) と [入力例](csv/costumes-import.example.csv) を使い、UTF-8のCSVに1行1衣装で入力する。衣装名は必須で、資料は最大5件。初出日は `YYYY-MM-DD`、キーワードはセル内で半角カンマ区切りにする。

`npm run db:csv -- --csv <CSVパス>` で検証し、`--apply --db <SQLite絶対パス>` を付けると既存のローカルD1へ非公開で追加する。本番DBへの接続には対応しない。同じCSVの再実行は重複登録になる。詳しいオプションは `scripts/import-costumes-csv.mjs` を参照する。

## ローカル開発

Node.js・npmのバージョンは `package.json` のVolta設定を参照する。新規環境は次の順で準備する。

1. `npm ci` で依存関係をインストールする。
2. 空のローカルDBで `npm run db:setup` を実行し、テーブルと開発用adminを作成する。既存DBには実行しない。
3. `.dev.vars.example` を `.dev.vars` にコピーし、ローカル設定を入力する。
4. `npm run dev` を起動し、`https://localhost:8788` を開く。初回は自己署名証明書をブラウザで許可する。

開発ログインはローカル専用。`DEV_AUTH_ENABLED=true` と `DEV_DISCORD_ID=999999999999999999` を設定して使用する。Discord OAuthを使う場合はクライアント情報とコールバックURLを設定する。

環境変数は `.dev.vars.example` と `wrangler.jsonc` を参照する。ローカル設定は `.dev.vars`、本番のシークレットはCloudflareのSecretで管理する。

## npmコマンド

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | ViteとWranglerを同時起動。一方が終了すると他方も停止 |
| `npm run build` | Vue・TypeScriptの型検査後、Viteで本番用の `dist/` を生成 |
| `npm run preview` | ビルド済みの `dist/` とFunctionsをローカル配信 |
| `npm run db:init` | 空のローカルDBに `docs/database/DDL.sql` でテーブルを作成 |
| `npm run db:dev-user` | `scripts/dev-user.sql` でローカル管理者を追加。登録済みなら変更しない |
| `npm run db:setup` | `db:init` → `db:dev-user` |
| `npm run db:csv -- --csv <パス>` | CSVを検証。`--apply --db <絶対パス>` を付けるとローカルへ新規登録 |

## 検証と生成物

実装変更時は `npm run build` と対象の画面・APIを確認する。文書のみの変更はリンク・差分・`git diff --check` を確認する。完了時は検証結果と未確認事項を報告する。

`dist/`・`node_modules/`・`.wrangler/` は生成物、`.dev.vars` はローカル設定、`.backups/` はバックアップで、Git管理対象外。

## ライセンスと運用上の扱い

ソースコードはルートの `LICENSE`（MIT）、第三者コード・アイコンは `public/third-party-licenses.txt` に従う。依存関係の変更時はライセンス表示も確認する。

本サイトは非公式のファン制作であり、MITライセンスは第三者コンテンツの利用権を付与しない。運用データ・DB・バックアップ・認証情報をGitへ追加せず、予期しない例外の詳細をログへ出さない。
