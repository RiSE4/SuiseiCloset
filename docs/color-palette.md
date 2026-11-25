# サムネイルのカラーパレット（試験実装）

既存のVue 3 / TypeScript、Cloudflare Pages Functions、D1を利用する。
既存サムネイルはHTTPS URLを直接表示する構成で、再利用できる画像デコード・加工処理はなかった。
今回も元の共通サムネイルURLを解析し、画像表示・サイズ・検索処理は維持する。

## 移植元

RiSE4/ColorPicker のコミット `780c06bc31035637e994fa56f63f1b34c6422714` から
`src/lib/color/` の5ファイルを無変更で移植した。詳細とライセンスの確認事項は
[UPSTREAM.md](../src/lib/color/UPSTREAM.md) を参照。
移植元にはLICENSE・package.jsonのlicense宣言がなかったため、公開配布前の許諾確認が残る。
公開リポジトリであることをライセンス許諾とは扱っていない。

## 抽出・表示

管理画面のサムネイル新規登録・URL変更の保存後、ブラウザでCORS付きfetchを1回実施。
失敗しても衣装の保存は完了する。URLが同じなら再解析しない。
既存衣装には管理画面の「カラーパレットを生成／再生成」操作を利用できる。
手動再生成が失敗した場合、同じ画像に対する既存の有効なパレットは保持する。
API・CSVだけで衣装を登録した場合はNULLで保存し、後から管理画面または補完スクリプトを利用する。

PNG/JPEG/WebPを最大8MiB、取得タイムアウト10秒、デコード後最大1600万画素に制限。
リダイレクトは拒否し、外部への認証情報は送らない。
createImageBitmapでデコードし、縦横比を維持して最大128×128のCanvasで解析する。
圧縮画像の画素数はデコード後に検査するため、デコード時のメモリ消費にはブラウザ依存の限界がある。
全透明画像・非対応形式・CORS/CSP制限・取得失敗は未生成として扱う。背景・無彩色も集計対象。
元画像・ピクセル座標はDB・R2・ファイルに保存しない。

`src/features/costumes/color-palette.ts` の `PALETTE_CONFIG` に調整値を集約。
alpha 16未満を除外し、RGB各3bitの最大512ビンに頻度とRGB和を集計する。
頻度順・ビン番号順の決定的な順序で、移植したmergeSimilarColors（CIE76、Delta E 7）から種色を作り、
最寄りの種色に各ビンの頻度を加算する。代表色は元RGBの頻度付き平均。
代表色間で距離の近い組を統合し、色差7未満の統合および最大10色への追加統合を行う。
Lab値を再利用し、全ピクセル同士は比較しない。
1～10色の大文字HEXと割合を、割合降順で保存する。割合は丸めず合計1を維持する。

ColorPaletteBar.vueは表示だけを担当する。12pxのSVG rectのfill・座標属性で安全に描画し、
動的style・HTML挿入・CSP緩和は使用しない。NULL・不正データなら非表示。
一覧・詳細・関連衣装カード・管理プレビューに表示する。管理画面のみHEXと割合も表示する。
一般の一覧・詳細表示では解析処理や解析用の画像リクエストを起こさない。

## DB・API

- 新規DB: `docs/database/DDL.sql`
- 既存DB: `docs/database/migration/color_palette.sql` を一度だけ適用する。
- `costume.color_palette`: nullable JSON TEXT（初期値NULL）。
- `costume.palette_revision`: INTEGER、初期値0。結果データとは別の競合検出用番号。
- thumbnail_url変更トリガーで旧パレットをNULLにし、番号を加算する。削除時にも動作する。
- `PUT /api/admin/costumes/:id/palette`: `{thumbnailUrl, revision, palette}`。
  既存のadmin/editor認証・Origin検証下で、色数・HEX・有限の割合・合計値を検証し、監査記録する。
- 保存はURLと変更番号が一致する場合のみ。A→B→Aでも古い解析結果は409で拒否する。
- 不正な保存済みJSONはDTO変換時にNULL扱いとし、既存表示を保つ。

## ローカルの既存衣装をNULL限定で補完

2026-11-25にローカルD1へマイグレーション適用済み。
適用前のバックアップは `.backups/before-color-palette-20261125.sql`（git対象外）。
適用直後は139衣装を保持、139件NULL、うち共通サムネイルURL付き123件。
補完スクリプトを実データ3件で試行し、3件すべて生成・保存成功。
最終確認時点のローカルDBは139衣装、4件生成済み、URL付きNULL行は119件。
再実行のdry-runでも対象119件となり、生成済み行は除外された。
画像取得・解析・ローカルD1保存を含め1件約2.4～3.3秒、保存JSONは464～472 bytesだった。
本番DBには接続・変更していない。本番用SQLの適用は手動で行う。

```sh
npm ci
npm run palette:backfill:local -- --dry-run --limit=1000
npm run palette:backfill:local -- --limit=1000 --delay-ms=500
```

このスクリプトは常に `wrangler d1 execute suisei-closet --local` を利用し、remote指定を受け付けない。
Playwright＋Chromeが必要。PlaywrightはdevDependencies・package-lock.jsonに固定し、
`npm ci` で導入する。インストール済みのChromeを利用するため、Playwright専用ブラウザの
ダウンロードは不要。Codex同梱ランタイムには依存しない。通常のアプリ実行・本番配信にはPlaywrightは不要。
VoltaのNode 22.16.0でも、ローカルD1のdry-runとChrome検証を確認済み。
画像解析は管理画面と同じモジュールをブラウザで実行するのでCORS制限を回避しない。
画像取得は逐次・既定500ms間隔。既定100件、上限1000件で対象を限定できる。
保存直前にも `color_palette IS NULL`・URL・変更番号を照合し、生成済みデータを上書きしない。
失敗行はNULLのまま継続し、失敗件数があれば終了コード1。再実行時にも成功済み行は取得対象外。
失敗行が先頭に多数残る場合はlimitを増やして後続行も対象にする。
ローカル管理者用CLIなのでAPI認証は使用せず、手元のローカルDBに直接更新する。

## 性能・アクセス・費用

128×128の決定的な人工ノイズで、抽出部分はこの環境のNode 24上で約76～220ms、
10色JSONは420 bytes。単色JSONはHEX＋ratioの1要素のみ。
ネットワーク・デコード・DB待ちを含む時間は画像・環境で変わり、管理画面・補完スクリプトで表示する。
実衣装画像の代表的な品質・時間の評価は別途必要。

一覧・詳細での追加解析リクエストは0。登録変更・再生成・NULL補完時は1画像につき取得1回、
通常のimg表示リクエストとは別になる（ブラウザキャッシュの影響あり）。
新しい有料サービス・画像ストレージ・公開プロキシは追加しない。
生成時は既存D1の更新が増える。API保存は監査INSERTも増えるため、利用枠の消費は増える。

## 検証

```sh
npm run test:palette
npm run build
npm run test:palette:browser
```

抽出・入力検証・SQLite実DBの新規DDL/既存移行・CRUD・URL変更/削除時クリア・
競合結果拒否・未生成衣装の一覧/詳細・匿名管理API拒否を検証。
Chromeで人工PNGのCanvas解析（赤75%/青25%）、実HTTPSサーバーのCORS成功/失敗、
保存継続、URL不変時・一覧での再解析なし、390px/1280pxのバー幅・高さ・横溢れを検証。
テスト画像はすべて実行時生成。実衣装画像はリポジトリに含めない。
APIブラウザテストはモック、DBテストはSQLiteを利用する。本番サービスの結合テスト・デプロイは未実施。
