# ☄ SuiseiCloset
多機能な衣装図鑑です。
衣装名、キーワード、カテゴリから公開されている衣装を検索し、紐づく資料を参照することができます。

## できること
### 👔 衣装を検索 / SEARCH FOR COSTUMES
衣装名、キーワード、カテゴリ、初出年を絞り込んで衣装を検索し、ヒットした衣装を探すことができます。
そこからさらに、衣装に紐づいている資料を探すことができます。外部サイトへのリンクを含みます。

### 📝 衣装の管理 / RECORD THE COSTUME
衣装情報と関連する資料を登録することができます。画像データはサーバーに保存せず、参照先のサーバーに直接リクエストを飛ばす設計です。

### 🔭 観測者の管理 / EDIT OBSERVERS
ユーザーのアクセス権を管理できます。
- OAuthが ```disabled``` の場合<br>
衣装一覧画面は認証不要で誰でも使用することができます。衣装・観測者の管理にはDidscord OAuth認証が必要です。
- OAuthが ```enabled``` の場合<br>
衣装一覧を含め、全ての機能にDiscord OAuth認証が必要です。

### 🔑 観測者の権限 / OBSERBER'S AUTHORITY
- **Member** : 一般ユーザーです。公開されている衣装情報を閲覧することができます。
- **Editor** : 一般ユーザーの機能に加え、衣装情報を登録、編集することができます。
- **Admin** : 管理者です。観測者の管理機能を含みます。

## 技術スタック

![Vue 3](https://img.shields.io/badge/Vue_3-4FC08D?style=flat&logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-F38020?style=flat&logo=cloudflarepages&logoColor=white)
![Cloudflare Pages Functions](https://img.shields.io/badge/Cloudflare_Pages_Functions-F38020?style=flat&logo=cloudflareworkers&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/Cloudflare_D1-F38020?style=flat&logo=cloudflare&logoColor=white)

## ライセンス / LICENSE
### ソースコードを公開する目的
サービスの透明性を維持し、アプリケーション構成や実装方式を再利用し、他のキャラクターやタレントなどを対象とした衣装図鑑へ応用できることを目指しています。

公開対象はアプリケーションのソースコードです。実サービスのデータベース、認証情報、第三者が権利を有するコンテンツを公開するものではありません。
サービスの説明、コンテンツ取り扱い方針、プライバシーポリシーは、サービス内の `/about` に掲載しています。

### ライセンスの適用範囲
ソースコードは、[MIT License](./LICENSE) の下で公開されます。

使用している第三者のコード・アイコンには、それぞれのライセンスが適用されます。[第三者ライセンス・著作権表示](./public/third-party-licenses.txt)を参照してください。

本リポジトリには、実際のサービスで使用している衣装情報や関連資料等の運用データは含まれていません。

ソースコード内には一部のキャラクターの固有名詞が含まれていますが、これらはアプリケーションの機能や表示内容を構成するためのものです。

本ライセンスは、第三者が権利を有する名称、商標、画像、映像、キャラクターその他のコンテンツに関する利用権を付与するものではありません。

**本プロジェクトは非公式のファン制作プロジェクトであり、関係する権利者による公式の提供・承認・後援を示すものではありません。**
