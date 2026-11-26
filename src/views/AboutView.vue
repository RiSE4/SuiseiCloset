<script setup lang="ts">
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faMagnifyingGlass, faBookOpen, faLink, faShieldHalved, faScaleBalanced, faEnvelope, faCode, faCrown } from '@fortawesome/free-solid-svg-icons';

const sections = [
  { id: 'service', title: 'SuiseiClosetについて' },
  { id: 'content', title: 'コンテンツ取り扱い方針' },
  { id: 'privacy', title: 'プライバシーポリシー' },
  { id: 'opensource', title: 'オープンソースについて' },
  { id: 'contact', title: 'お問い合わせ' },
];

const journey = [
  { icon: faMagnifyingGlass, title: '衣装を探す', description: '衣装名やキーワードを手がかりに、気になる一着を見つける。' },
  { icon: faBookOpen, title: '資料を見渡す', description: '衣装に関連する投稿や動画を、まとめて確認する。' },
  { icon: faLink, title: '資料を見つける', description: '元の投稿や公開元へ。細かな設定や利用条件は、そこで確かめる。' },
];
</script>

<template>
  <div class="about-layout">
    <article class="about-page">
      <header class="page-intro archive-intro">
        <p class="eyebrow">About Service</p>
        <h1>サービス概要</h1>
      </header>

      <section id="service" class="about-section" aria-labelledby="service-heading">
        <h2 id="service-heading">
          <FontAwesomeIcon :icon="faCrown" aria-hidden="true" /> SuiseiClosetについて
        </h2>

        <div class="origin-story">
          <h3 class="story-title">「つくりたい」を<br><span>資料探しで止めない</span></h3>
          <div class="story-problem">
            <p class="problem-title">元の設定画、どこだっけ？</p>
            <p>細部を見たいのに、元の投稿がなかなか見つからない。毎回探し直すのも大変。<br class="desktop-break">公開元の正しい資料を、高い解像度で確かめたい。</p>
          </div>
          <p class="story-answer">そんな資料探しの不便さを解決するために生まれたのが、<strong>SuiseiCloset</strong> です。<br>
            歴代の衣装と関連資料を整理し、散らばった星を星座のようにつなぐ衣装図鑑です。
          </p>
        </div>

        <ol class="journey" aria-label="SuiseiClosetで資料を探す流れ">
          <li v-for="step in journey" :key="step.title">
            <span class="journey-icon">
              <FontAwesomeIcon :icon="step.icon" aria-hidden="true" />
            </span>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </li>
        </ol>

        <p class="service-notice">
          本サイトは非公式のファンメイドサイトです。
          カバー株式会社、ホロライブプロダクションおよび所属タレントによる公式サービスではありません。
        </p>
        <p class="service-notice">
          掲載情報には誤りや更新の遅れが含まれる場合があり、完全性・正確性・最新性を保証するものではありません。
        </p>
      </section>

      <section id="content" class="about-section" aria-labelledby="content-heading">
        <h2 id="content-heading">
          <FontAwesomeIcon :icon="faScaleBalanced" aria-hidden="true" /> コンテンツ取り扱い方針
        </h2>
        <h3>著作者・制作者への敬意</h3>
        <p>
          本サービスは、著作者・制作者の創作活動と意思を尊重し、著作権および著作者人格権に配慮して運営します。
          著作者名やクレジットの表示を尊重し、参照元を明示するとともに、作品の趣旨をゆがめる紹介や、著作者・権利者の名誉や信用を損なう取り扱いを行いません。
        </p>
        <h3>法令・ガイドラインの遵守</h3>
        <p>
          著作権法その他の関係法令を遵守し、文化庁などの関係省庁が公表する指針・ガイドラインのうち、本サービスに適用されるものに従って運営します。
          文化庁の<a href="https://www.bunka.go.jp/seisaku/chosakuken/seidokaisetsu/" target="_blank"
            rel="noopener noreferrer">著作権に関する解説・資料</a>を確認し、著作者名の表示、公表の意思、作品の内容を意に反して改変されない権利を尊重します。
          また、権利者が定めるガイドライン、コンテンツの利用条件および外部サービスの利用規約を確認し、本サービスに適用される範囲において遵守します。
          これらの条件が変更された場合や、取り扱いに問題が判明した場合は、掲載方法の見直しや掲載停止などの対応を行います。
        </p>
        <h3>資料の収集・表示方法</h3>
        <ul class="content-practices">
          <li>衣装情報や関連資料は、運営者が手動で収集・整理しています。</li>
          <li>掲載する画像・映像などの第三者コンテンツの権利は、それぞれの権利者に帰属します。</li>
          <li>画像データは本サービスのサーバーに永続保存せず、外部サービス上の画像を参照して表示します。</li>
          <li>X・YouTubeの関連資料は、各サービスの公式埋め込み機能を利用します。</li>
          <li>カラーパレットは、画像の色情報を解析して衣装の特徴を補助的に表示するものです。</li>
          <li>外部サービスでの投稿削除や公開設定の変更などにより、画像や資料を閲覧できなくなる場合があります。</li>
        </ul>
        <h3>資料の掲載停止</h3>
        <p>
          権利者からの利用中止・掲載停止・削除の要請には、対象および権利者ご本人または代理人であることを確認のうえ、その意向に従い速やかに対応します。
          掲載内容に誤りや問題が判明した場合も、訂正・削除等の対応を行います。<br>
          <RouterLink to="/about#contact">お問い合わせ</RouterLink>に記載の連絡先までご連絡ください。
        </p>
      </section>

      <section id="privacy" class="about-section" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">
          <FontAwesomeIcon :icon="faShieldHalved" aria-hidden="true" /> プライバシーポリシー
        </h2>

        <h3>一般の閲覧</h3>
        <p>
          衣装及び関連資料の閲覧にはログインは不要です。サービス運営者より、衣装情報の管理機能へのアクセスを事前に認められたユーザーに限り、ログインを要求します。
          ログインしていない利用者のアカウント情報や認証用セッションは保存せず、認証用Cookieも発行しません。
        </p>

        <h3>アクセス情報の取り扱い</h3>
        <p>
          本サービスでは、サービスの安定運用、不正アクセスの防止および障害調査を目的として、IPアドレス、アクセス日時、
          ブラウザ情報、アクセス先URL等の情報が、配信基盤を通じて取得・処理される場合があります。
          これらの情報は、サービスの運用およびセキュリティ対策に必要な範囲で取り扱います。
        </p>

        <h3>管理者等の認証・情報管理</h3>
        <p>
          Discord OAuthを通じて取得したユーザーID・表示名および本サービスが管理するセッション情報を、認証やアクセス管理に使用します。
          これらの情報は認証・安全な運用・不具合対応に利用し、管理機能へのアクセスを権限で制限します。
        </p>

        <h3>外部サービスとの通信</h3>
        <p>
          配信・データ保存にCloudflare、認証にDiscord、画像・動画等の表示にX・YouTubeおよび資料の掲載サイトを利用します。
          外部画像や埋め込みの読み込み時には、ブラウザから提供元へ直接通信が発生します。
          これらの通信に伴い、外部サービスによってIPアドレス、ブラウザ情報、Cookie等の情報が取得・処理される場合があります。
          当該情報の取り扱いについては、各外部サービスのプライバシーポリシーをご確認ください。
        </p>
        <p class="privacy-provider-links">
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare</a> /
          <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">Discord</a> /
          <a href="https://x.com/privacy" target="_blank" rel="noopener noreferrer">X</a> /
          <a href="https://www.youtube.com/howyoutubeworks/privacy/" target="_blank"
            rel="noopener noreferrer">YouTube</a>
        </p>

        <h3>お問い合わせに伴う情報の取り扱い</h3>
        <p>
          お問い合わせの際に取得したメールアドレス、氏名その他の情報は、
          お問い合わせへの回答、事実関係の確認および必要な対応のために利用します。
          取得した情報は、法令に基づく場合等を除き、これらの目的に必要な範囲で取り扱います。
        </p>
        <p style="margin-top: 10px;">
          本ポリシーは変更される場合があります。
          情報の取り扱いに関するご質問は、<RouterLink to="/about#contact">お問い合わせ先</RouterLink>へご連絡ください。
        </p>
      </section>

      <section id="opensource" class="about-section" aria-labelledby="opensource-heading">
        <h2 id="opensource-heading">
          <FontAwesomeIcon :icon="faCode" aria-hidden="true" /> オープンソースについて
        </h2>

        <p>本サービスのソースコードは、技術的知見の共有およびアプリケーションの再利用を目的として、<a href="https://github.com/RiSE4/SuiseiCloset" target="_blank"
            rel="noopener noreferrer">GitHub</a>で公開しています。他のキャラクターやタレント等を対象とした衣装図鑑への応用も想定しています。
          ソースコードには

          <a href="https://github.com/RiSE4/SuiseiCloset/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
            MIT License
          </a>が適用されます。
        </p>
        <p>本サービス内で使用する第三者製のソフトウェアおよびライブラリには、それぞれのライセンスが適用されます。<br>
          詳細は<a href="/third-party-licenses.txt" target="_blank" rel="noopener">Third Party Licenses</a>
          をご確認ください。
        </p>
        <p>
          衣装画像・映像・名称・商標・キャラクターなど、第三者が権利を持つコンテンツの利用権に対しては MIT License は適用されません。<br>
          実際のサービスで運用する衣装データベース、認証情報、シークレット、第三者コンテンツは、ソースコードの公開対象に含まれません。
        </p>
      </section>

      <section id="contact" class="about-section" aria-labelledby="contact-heading">
        <h2 id="contact-heading">
          <FontAwesomeIcon :icon="faEnvelope" aria-hidden="true" /> お問い合わせ
        </h2>

        <p>
          サービスに関するお問い合わせは下記までお願いします。<br>
        </p>
        <p class="contact-address">
          <span>お問い合わせ先</span><a href="mailto:avio5912.development@mail.com">avio5912.development@mail.com</a>
        </p>
      </section>
      <p class="about-updated">最終更新日：<time datetime="2026-11-26">2026年11月26日</time></p>
    </article>
    <nav class="about-toc" aria-label="このページの目次">
      <p class="about-toc-title">目次</p>
      <ul>
        <li v-for="section in sections" :key="section.id">
          <RouterLink :to="`/about#${section.id}`">{{ section.title }}</RouterLink>
        </li>
      </ul>
    </nav>
  </div>
</template>

<style scoped>
.about-updated {
  margin-top: 32px;
  color: #a9bed2;
  font-size: .875rem;
  text-align: right;
}

.about-layout {
  margin-inline: auto;
}

.about-page {
  min-width: 0;
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.about-page>.page-intro {
  padding-bottom: 8px;
  margin-bottom: 12px;
}

#service {
  margin-top: 12px;
}

#service-heading {
  margin-top: 0;
}

.origin-story {
  padding: clamp(22px, 4vw, 40px);
}

.about-section .story-title {
  margin: 0;
  font-size: clamp(1.75rem, 3.6vw, 2.65rem);
  line-height: 1.55;
  letter-spacing: .03em;
  color: #f1f4ff;
  padding-bottom: 26px;
}

.story-title span {
  color: #c5ddff;
}

.story-problem {
  padding: 18px 20px;
  border-left: 2px solid #a9a0ca;
  background: #060c1d55;
  border-radius: 0 10px 10px 0;
}

.story-problem p {
  margin: 0;
  color: #c3cbe0;
}

.story-problem .problem-title {
  color: #f1f4ff;
  font-size: clamp(1.4rem, 4vw, 1.8rem);
  font-weight: 700;
  margin-bottom: 8px;
}

.story-answer {
  margin-top: 26px;
  color: #e4eafb;
}

.origin-story>p:last-child {
  margin-bottom: 0;
  color: #c3cbe0;
}

.journey {
  list-style: none;
  padding: 0 !important;
  display: grid;
  gap: 14px;
  margin: 20px 0;
}

.journey li {
  position: relative;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #121c3299;
  margin: 0 !important;
}

.journey-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #a6c8ff12;
  color: #b6eaff;
  font-size: 1.1rem;
}

.about-section .journey h3 {
  margin: 14px 0 8px;
  font-size: 1.05rem;
  color: #eef2ff;
}

.journey p {
  margin: 0;
  color: #bcc6de;
  font-size: .9375rem;
}

.about-section .service-notice {
  color: #b4bdd3;
  font-size: .875rem;
}

.about-section h2>svg {
  width: 1.1em;
  color: #c6bded;
  margin-right: 6px;
}

.content-practices {
  list-style: none;
  padding: 0 !important;
}

.content-practices li {
  position: relative;
  padding: 2px 0 2px 20px;
}

.about-section .content-practices li+li {
  margin-top: 4px;
}

.content-practices li::before {
  content: '·';
  position: absolute;
  left: 4px;
  color: #c6bded;
  font-weight: 700;
}

.contact-address {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #121c3299;
}

.contact-address span {
  display: block;
  color: #b4bdd3;
  font-size: .875rem;
  margin-bottom: 6px;
}

.contact-address a {
  font-weight: 650;
}

@media (min-width: 700px) {
  .journey {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .journey li:not(:last-child)::after {
    content: '';
    position: absolute;
    right: -15px;
    top: 42px;
    width: 14px;
    border-top: 1px solid #8b9fc0;
  }
}

@media (max-width: 699px) {
  .desktop-break {
    display: none;
  }

  .journey li {
    padding: 18px 18px 18px 76px;
  }

  .journey-icon {
    position: absolute;
    left: 18px;
    top: 20px;
  }

  .about-section .journey h3 {
    margin-top: 0;
  }

}

@media print {
  .about-toc {
    display: none !important;
  }
}

.about-toc {
  display: none;
}

.about-toc-title {
  margin: 0 0 16px;
  color: #ecf5ff;
  font-weight: 700;
}

.about-toc ul {
  margin: 0;
  padding: 0;
  list-style: none;
  border-left: 1px solid #34506b;
}

.about-toc a {
  display: block;
  padding: 10px 0 10px 16px;
  color: #a9bed2;
  font-size: .875rem;
  line-height: 1.6;
  text-decoration: none;
}

.about-toc a:hover,
.about-toc a:focus-visible {
  color: #8fe5f4;
  background: #10203680;
}

.about-section h2 {
  font-size: clamp(1.25rem, 4vw, 1.5rem);
  padding-bottom: 12px;
  border-bottom: 1px solid #34506b;
}

.about-section h3 {
  font-size: 1.1rem;
  margin-top: 28px;
  color: #d2eafa;
}

.about-section p,
.about-section li {
  line-height: 1.9;
}

.about-section ul {
  padding-left: 1.4em;
}

.about-section li+li {
  margin-top: 12px;
}

@media (min-width: 1024px) {
  .about-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 48px;
    max-width: none;
    align-items: start;
  }

  .about-toc {
    display: block;
    position: sticky;
    top: 96px;
    margin-top: 12px;
  }
}
</style>
