# SuiseiCloset エージェント向けガイド

この文書をエージェント向け資料の入口とする。実装・運用の変更時は、該当する段落を更新し、説明をここに集約する。プロジェクトルートの `README.md` はGitHub表示用に人間が手動管理するため、ユーザーから明示的な指示がない限り編集しない。本文中のコード表記のパスとコマンドは、プロジェクトルートを基準とする。

作業前に `git status --short` と対象ファイルの差分を確認し、既存の未コミット変更を保持する。現在のソース・設定・`package.json` を仕様確認の基準にし、削除済みの手順書や過去の検証結果を現状の根拠にしない。文書だけの更新を依頼された場合は、実装や設定の不整合もこの文書へ記録し、ソースコード・SQL・設定・依存関係は変更しない。

## 構成

各フォルダの構成は以下の通り。

- `src/` : Vue 3・TypeScriptの画面とサーバー処理
  - `src/app/` : ルート定義
  - `src/features/` : 認証・衣装・観測者の画面、APIクライアント、型と共通検証
  - `src/shared/` : 共通HTTP処理（`api/`）と検索結果へのスクロール処理
  - `src/server/` : サーバーの処理本体
- `functions/` : Cloudflare Pages Functionsの入口
- `public/` : 静的ファイル、Functionsの適用範囲、第三者ライセンス表示
- `scripts/` : 手動実行する開発補助ツール
- `docs/` : エージェント向けの指示書・DB定義・CSV入力例・メモ

フロントエンドはVue Router、Font Awesome、SortableJSを使用する。APIはCloudflare Pages Functions、DBはD1（バインド名 `DB`）。`functions/api/[[path]].ts` と `functions/auth/[[path]].ts` はそれぞれ `src/server/api.ts` と `src/server/auth/handler.ts` に委譲する。APIのDTOは `src/features/costumes/costume-model.ts`、DBレコードの型は `costume-record.ts`、環境変数の型は `src/server/types.ts` を参照する。

## 認証

Discord OAuthとセッションで認証し、`/api/me` で認証状態を取得する。`OAUTH_ENABLED` が文字列 `false` の場合だけ匿名閲覧と任意ログインを許可し、未設定を含むそれ以外は登録済み・有効なアカウントのログインを閲覧にも要求する。`/` が入口、`/login` が任意ログイン画面で、ログイン済みなら衣装一覧へ移動する。権限は `member`（閲覧のみ）、`editor`（衣装・資料の管理）、`admin`（衣装・資料と観測者の管理）の3種類。画面ではルートのmetaと `src/App.vue`、APIでは `src/server/api.ts` で権限を確認する。

## 観測者の管理

admin専用の `/admin/users` をヘッダー・サイドバーの「観測者の編集」から開く。Discord IDとroleは通常非活性で、行ごとの編集・保存・キャンセルと新規追加に対応する。編集ボタンの右に削除ボタンを表示し、行内の確認後に観測者とセッションを削除する。表示名と有効状態は保持し、新規アカウントの表示名はDiscordログイン時に取得する。APIは `/api/admin/users` のGET・POST、`/api/admin/users/:discord_id` のPATCH・DELETE。Discord IDは17～20桁の数字で重複不可。ID変更はトランザクションで移行し、旧IDのセッションは削除する。自分自身のID変更・降格・無効化・削除は拒否する。変更は監査ログへ記録する。

## 衣装の閲覧・検索

`/costumes` で公開衣装を検索し、`/costumes/:id` で詳細・資料・関連衣装を表示する。一般画面は初出年を表示し、DBには `YYYY-MM-DD` の初出日を保存する。一覧は `debut_date DESC, id` 順。閲覧APIは `/api/costumes`、`/api/costumes/:id`、`/api/categories`、`/api/pub-years`。一般向けの絞り込み候補と関連衣装にも公開衣装だけを使う。管理向けの候補APIは `/api/admin/categories` と `/api/admin/pub-years` で、非公開も含む。

一覧の検索条件はURLの `q`・`category`・`pubYear`・`page` に保持し、画面は1ページ24件。管理一覧では `published=true|false` も使用する。APIのページングは `limit`（1～100、既定24）と `offset`（0～1,000,000、既定0）。カテゴリは完全一致、初出年は2018～2100年。衣装名とキーワードから作る `search_text` の部分一致検索では、NFKC・小文字化・カタカナのひらがな化・空白除去を検索語にも適用する。検索条件の変更時や画面破棄時は通信を中断し、古い応答で表示を上書きしない。

## 衣装の管理

`/admin/costumes` で検索と公開状態の絞り込み、`/admin/costumes/new` で非公開の衣装を作成、`/admin/costumes/:id/edit` で基本情報・キーワード・関連衣装・資料を編集する。資料は衣装の保存後に個別保存し、基本情報の未保存変更を上書きしない。公開切り替えは管理一覧のボタン操作時に保存する。衣装APIは `/api/admin/costumes` のGET・POST、`/api/admin/costumes/:id` のGET・PATCH・DELETE。衣装の削除時は紐づく資料も削除する。

APIは未対応の入力項目を拒否する。衣装名は必須で150文字以内、カテゴリは120文字以内、説明は4000文字以内、キーワードは最大32個・各80文字以内。空のキーワードと正規化後の重複を拒否する。PATCHでは省略した項目を保持し、解除可能な項目は `null` を明示する。衣装名・キーワードの更新時は `search_text` も同じバッチで更新する。

関連衣装は `family_key` を共有するグループとして管理する。APIには `relatedCostumeId` で既存衣装を指定し、自分自身や異なる既存グループ同士の統合を拒否する。編集画面で関連先を操作していない場合は送信項目から省き、解除時は `null` を送る。解除するのは編集対象の所属で、グループ全体ではない。

初出日は年月日の順で入力する。数字の間の区切り文字は混在でき（例: `2024-04/1`、`2024年/4-1日`）、全角数字・記号にも対応する。入力欄から離れたときと保存時に `YYYY-MM-DD` に補完する。区切りなしの8桁 `YYYYMMDD` に加え、年の後だけ区切った `2026年0201` も月日を2桁ずつに分けて補完する。`202112` や `2026年201` などの曖昧な入力は保存時にエラーにする。空欄は未設定として保存でき、日付は2018～2100年の実在する日に限定する。

初出日の入力エラーは、有効な日付または空欄へ修正して入力欄から離れた時点で解除する。保存済みの日付へ戻して保存ボタンが無効になった場合にもエラーを残さない。保存成功時も入力エラーの状態を解除する。

衣装編集・新規登録の保存バーは画面下部に固定表示する。保存ボタンの右側に控えめな「一覧に戻る」ボタンを置く。戻り先はURLの `from` を優先し、なければ `sessionStorage`・メモリに保持した管理一覧の検索状態を使う。許可する戻り先は `/admin/costumes` とその検索クエリに限定する。未保存時の離脱確認は `onBeforeRouteLeave` と `beforeunload` で行い、保存・削除中は「一覧に戻る」ボタンを無効にする。ページ末尾にはバーのための余白を確保する。

## 資料の表示順

資料は「三面図・設定画（`THREE_VIEW`）→ 元配信・元動画（`VIDEO`）→ その他資料（`OTHER`）」の区分順に表示し、同一区分内はドラッグまたはハンドルの矢印キーで並べ替える。`costume_source.sort_order` は衣装内で0から連番にする。衣装自体には `sort_order` を持たせない。

資料追加は `POST /api/admin/costumes/:id/sources`、更新・削除は `/api/admin/sources/:id` のPATCH・DELETE、並べ替えは `PUT /api/admin/costumes/:id/sources/order` に全資料のID配列 `{ ids }` を送る。区分・タイトル・参照先URLは必須、タイトルは150文字以内、URLは2048文字以内で認証情報を含まないHTTPSに限定する。共通サムネイルと資料画像も同じURL検証を使う。画像データは保存せず外部URLをブラウザーで参照し、画像未指定のVIDEO資料は対応するYouTube URLからサムネイルを補完する。

## DBと衣装ID

[初期DDL](DDL.sql) はユーザー・セッション・OAuth状態・監査ログ・衣装・資料とインデックス、キーワード検証トリガー、採番位置を定義し、新規DBの作成に使う。既存DBへ再実行しない。衣装IDと資料の外部キーはTEXTで、`sqlite_sequence` の `name = 'costume_id_sequence'` の行を0で初期化し、登録時に `seq = seq + 1` で `costume-001` 形式を生成する。同名テーブルは作成しない。999の次は1000となり、削除した番号は再利用しない。画面登録とCSV登録で `src/server/costumes/costume-id.ts` の同じ採番SQLを使用し、登録失敗時は採番も取り消す。

APIからの衣装・資料・観測者の変更は監査ログと同じD1バッチで保存する。現在のリポジトリには既存DB用の移行SQLや本番反映手順書は含まれていない。既存DBの変更を依頼された場合は、実スキーマと採番位置・既存データを確認して個別の移行手順を用意する。

## CSVでの一括登録

入力ファイルは `docs/csv/` にある。[空テンプレート](csv/costumes-import.template.csv) に1行1衣装で入力し、[入力例](csv/costumes-import.example.csv) を参照する。ExcelではCSV UTF-8で保存する。`npm run db:csv -- --csv <CSVパス>` は検証のみで、`--apply --db <SQLite絶対パス>` を付けると、このプロジェクトの `.wrangler/state/` 内の既存ローカルD1へ追加する。Shift_JISは `--encoding shift_jis` を指定する。本番接続機能はない。CSVの初出日は `yyyy-mm-dd` で入力し、画面のような区切り文字の補完は行わない。

衣装名は必須、初出日・説明・共通サムネイル・キーワードは省略可能。キーワードはセル内で半角カンマ区切り、資料は最大5件で、入力する資料には区分・タイトル・参照先URLが必要。URLは認証情報を含まないHTTPSとする。資料の同一区分内はCSVの左から順に保存する。全行を検証後、1トランザクションで非公開の新規衣装として追加し、カテゴリと関連衣装は未設定にする。同じCSVを再実行すると重複登録になるため注意する。

## ローカル開発

Node.js・npmの指定は `package.json` のVolta設定（Node.js 22.16.0、npm 11.6.2）を参照する。新規環境は次の順で準備する。

1. `npm ci` で依存関係をインストールする。
2. 空のローカルDBに `npx wrangler d1 execute suisei-closet --local --file=docs/DDL.sql` を実行する。既存DBには実行しない。
3. `npm run db:dev-user` で開発用admin（Discord ID `999999999999999999`）を追加する。既存の同IDは変更しない。
4. `.dev.vars.example` を `.dev.vars` にコピーし、ローカル設定を入力する。開発ログインを使う場合は `DEV_AUTH_ENABLED=true` と `DEV_DISCORD_ID=999999999999999999` を設定し、使わない場合は `DEV_AUTH_ENABLED=false` にする。
5. `npm run dev` で起動する。衣装は管理画面かCSVで追加する。

現状の `db:init` は存在しない `docs/schema.sql` を参照しているため、`db:setup` もそのままでは初期化できない。上記のDDL直接指定を使い、設定の修正は別途依頼された場合に行う。

環境変数は `APP_ORIGIN`、`DISCORD_CLIENT_ID`、`DISCORD_CLIENT_SECRET`、`DISCORD_REDIRECT_URI`、`OAUTH_ENABLED`、開発用の `DEV_AUTH_ENABLED`・`DEV_DISCORD_ID`。`DEV_AUTH_ENABLED` は文字列 `true` で有効、`false` で無効にする。未設定やそれ以外の値（`1`・`0` を含む）では有効にしない。開発ログインには、これに加えて接続先と `APP_ORIGIN` が `localhost` または `127.0.0.1`、17～20桁の `DEV_DISCORD_ID` がDBに有効なユーザーとして登録済みであることが必要。Discord OAuthを使う場合はクライアント情報とコールバックURLを設定する。本番向けの変数とD1接続先は `wrangler.jsonc` にあるため、ローカルでは `.dev.vars` で上書きし、クライアントシークレットはローカル設定またはCloudflareのSecretで管理する。

画面は `https://localhost:8788`。Viteが `/api` と `/auth` を `https://127.0.0.1:8789` のWranglerへ転送する。Vue・CSSはHMR、Functionsと参照先のサーバーコードはWranglerの再ビルドで反映する。初回は開発用の自己署名証明書をブラウザで許可する。

## npmコマンド

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | ViteとWranglerを同時起動。一方が終了すると他方も停止 |
| `npm run build` | Vue・TypeScriptの型検査後、Viteで本番用の `dist/` を生成 |
| `npm run preview` | ビルド済みの `dist/` とFunctionsをローカル配信 |
| `npm run db:init` | `docs/DDL.sql` をローカルに適用 |
| `npm run db:dev-user` | `scripts/dev-user.sql` でローカル管理者を追加。登録済みなら変更しない |
| `npm run db:setup` | `db:init` → `db:dev-user`。現状は `db:init` の参照先不一致で初期化できない |
| `npm run db:csv -- --csv <パス>` | CSVを検証。`--apply --db <絶対パス>` を付けるとローカルへ新規登録 |

## 検証と生成物

実装変更時は `npm run build` で `src/`・`functions/` を含む型検査とフロントエンドのビルドを確認し、変更機能の画面・APIをローカルで確認する。現状は `tests/` がないため、npmのテストコマンドを自動テストの完了根拠にしない。削除済みのテスト・移行検証・報告書について、過去の成功を現在の検証結果として記載しない。

文書だけの変更ではリンク・参照先・差分と `git diff --check` を確認し、アプリのビルドやDB変更は不要。完了時は変更内容、実行した確認、未解決の制約を報告する。`dist/`、`node_modules/`、`.wrangler/`、`.artifact-work/` は生成物、`.dev.vars` はローカル設定、`.backups/` はバックアップで、Git管理対象外。

## ライセンスと運用上の扱い

自作ソースコードはルートの `LICENSE`（MIT）に従う。第三者のコード・アイコンは `public/third-party-licenses.txt` を参照し、フッターからのリンクを維持する。依存関係を変更する際は、同梱表示のバージョン・帰属・ライセンス内容も確認する。

実サービスの衣装情報・資料等の運用データはリポジトリに含めない。ローカルDB・バックアップ・認証情報をGitへ追加せず、既存のエラー処理と同様に予期しない例外の本文やスタックをログへ出さない。本プロジェクトは非公式のファン制作プロジェクトであり、ソフトウェアのMITライセンスは第三者コンテンツの利用権を付与しない。
