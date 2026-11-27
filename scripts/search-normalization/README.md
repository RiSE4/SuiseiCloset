# 検索用データの生成・運用

管理画面と衣装詳細画面の保存時に、衣装名・キーワード・説明から検索用データを再生成する。
通常の検索時は、DBに保存した検索用データだけを利用する。

## 開発・ビルド

Node 22.16.0 / npm 11.6.2を使用する。

```sh
npm ci
npm run search:prepare
npm run dev
npm run build
```

初回の`search:prepare`で、`dataset-lock.json`に固定したVOICEVOX公開辞書を取得し、
サイズとSHA-256を検証する。取得先はGit管理対象外の`.cache/search-normalization/dataset.jsonl`。
既存ファイルが固定版と一致しない場合はエラーにする。

開発・ビルド時は`prepare-assets.mjs`が、英語辞書とKuromoji同梱辞書を
`public/search-normalization/`へコピーする。この配信用ディレクトリもGit管理対象外。
辞書は同一オリジンから保存時にだけ読み込み、Web Worker内で初期化・共有する。
辞書の初回取得後、保存・検索時に外部APIやCDNは使用しない。

## 保存形式と検索

`costume.search_text`には、重複を排除した単語候補と並び順を持つJSONを保存する。

```json
{"version":2,"words":["mikometto","kanpani-","company"],"phrases":[[[0],[1,2]]]}
```

この例では`mikomettokanpani-`、`mikomettocompany`、`mikometto kanpani-`で検索できる。
検索時に候補を連結して照合し、全文の組み合わせは展開しない。
単語途中の部分一致も許可するが、別のキーワード同士は連結しない。
クエリはNFKC・小文字・ひらがなに正規化し、空白を除去する。

クライアントは元データと生成候補を一緒に送信する。
サーバーは元データとの一致・候補形式・上限・元の表記での検索を確認し、
元データと検索用データを同じ操作で保存する。キーワードの削除時も全項目から再生成する。
入力JSONは衣装の作成・更新で最大1 MiB、検索索引は150,000文字・2,500単語・10,000位置・50,000参照まで。
旧形式の平文索引とバージョン1の保存リクエストも扱える。

公開・管理APIは、公開状態・カテゴリ・年等で絞った保存済み索引を照合し、
一致したIDに対してDBで件数・ページを取得する。検索時には読み生成器を読み込まない。
辞書による固有名詞の誤読や表記差は残るため、必要な別名はキーワードで補う。

## ローカルD1の索引再生成

```sh
npm run search:rebuild:local
npm run search:rebuild:local -- --apply
```

既定は読み取り専用。`--apply`で既存ローカルD1の`search_text`だけを再生成する。
ローカルの運用処理は`rebuild-local-index.mjs`の1ファイルにまとめている。
DBの特定・辞書の読み込み・索引の再生成・上書きまでこのファイルで実行し、CSV取込には接続しない。
更新前の検索語は`.backups/search-normalization/`へ退避する。
本番接続・任意SQL・任意DB指定の機能はない。

## 開発時のAPI再読み込み

APIのソースを変更した後は、起動中のPages Functionsにも反映されていることを確認する。
Wranglerが`src/server/`や共有モジュールの変更を検知しない場合は、`npm run dev`を再起動する。
Vite側の画面更新だけでは、バックエンドの更新を確認できない。

第三者のライセンス全文・辞書の著作権表示とNOTICEは、`public/third-party-licenses.txt`へまとめている。
このファイルもビルド時に配布物へコピーされる。
