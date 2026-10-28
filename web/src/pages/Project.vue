<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

const features = [
  { no: '01', title: '有记忆的口语教练', text: '从学习目标与表达证据出发安排练习。纠错会进入学习档案，后续对话可以继续围绕薄弱点训练。', mark: '对话 → 复练' },
  { no: '02', title: '看得见的能力变化', text: '词汇、语法、发音、流畅度和自然度由学习记录逐步建立。证据不足时保留“待评估”，不以空数据制造进步。', mark: '证据驱动' },
  { no: '03', title: '语音与教材融入练习', text: '通过跟读、语音识别和教材图片理解拓展练习入口；发音和 OCR 反馈保留模型能力边界。', mark: '多模态练习' },
  { no: '04', title: '可解释的教学检索', text: '学习问题可以调用教学知识库、歌词曲库和个人词汇工具；检索过程在对话中显示，便于理解回答来源。', mark: 'Agent + RAG' }
];

function enter() {
  router.push('/login');
}
</script>

<template>
  <main class="project-page">
    <nav class="project-nav" aria-label="项目导航">
      <router-link to="/project" class="project-brand"><span class="brand-glyph">한</span> 한국어 친구</router-link>
      <div class="nav-right">
        <a href="#approach">设计思路</a>
        <a href="#architecture">技术架构</a>
        <button class="nav-cta" @click="enter">进入体验 <span>↗</span></button>
      </div>
    </nav>

    <section class="project-hero">
      <div class="hero-copy">
        <div class="eyebrow"><span class="eyebrow-dot"></span> AI 韩语口语学习作品</div>
        <h1>把每一次开口，<br /><em>变成下一次更好的表达。</em></h1>
        <p class="hero-description">한국어 친구是一位有学习记忆的韩语口语教练。它将对话、纠错、复习和能力记录连成一条持续练习的路径。</p>
        <div class="hero-actions">
          <button class="primary-action" @click="enter">开始体验 <span>→</span></button>
          <a class="text-action" href="#approach">了解作品 <span>↓</span></a>
        </div>
        <div class="hero-meta"><span>WEB · 微信小程序</span><i></i><span>Vue 3 · Node.js · Agent</span></div>
      </div>

      <div class="loop-card" aria-label="学习闭环示意图">
        <div class="loop-card-head"><span>LEARNING LOOP / 01</span><span class="status-light">● 持续记录</span></div>
        <div class="loop-quote">“저는 어제 친구를 만났어요.”</div>
        <div class="loop-translation">我昨天见了朋友。 <span>语法正确</span></div>
        <div class="loop-rule"></div>
        <div class="loop-insight"><span class="insight-icon">↗</span><div><b>练习有了下一步</b><small>AI 将结合你的表达与薄弱点继续追问</small></div></div>
        <div class="loop-path">
          <span><b>01</b>表达</span><i></i><span><b>02</b>分析</span><i></i><span><b>03</b>记忆</span><i></i><span><b>04</b>复练</span>
        </div>
      </div>
      <div class="hero-index" aria-hidden="true">KFP<br />2026</div>
    </section>

    <section id="approach" class="section approach-section">
      <div class="section-heading">
        <div class="section-index">01 / WHAT IT DOES</div>
        <div><h2>让练习留下痕迹，<br />让下一次更有方向。</h2><p>不是一次问答的终点，而是可追踪的学习循环。</p></div>
      </div>
      <div class="feature-grid">
        <article v-for="feature in features" :key="feature.no" class="feature-card">
          <div class="feature-top"><span>{{ feature.no }}</span><span class="feature-mark">{{ feature.mark }}</span></div>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.text }}</p>
          <div class="feature-line"></div>
        </article>
      </div>
    </section>

    <section class="demo-section">
      <div class="demo-copy">
        <div class="section-index">02 / TRY THE PRODUCT</div>
        <h2>三分钟，走完一次<br />学习闭环。</h2>
        <p>登录或创建账号后，从首页打开“演示模式”，按预置剧本体验水平测试、纠错、错误记忆和情景复练。演示数据与真实档案隔离。</p>
        <button class="outline-action" @click="enter">前往体验 <span>→</span></button>
      </div>
      <ol class="demo-steps">
        <li><span>01</span><div><b>打开演示模式</b><small>首页入口 · 无需配置 AI Key</small></div><span class="step-mark">↗</span></li>
        <li><span>02</span><div><b>观察一次表达纠错</b><small>理解错误如何被说明与记录</small></div><span class="step-mark">↗</span></li>
        <li><span>03</span><div><b>查看记忆与后续复练</b><small>从本轮反馈进入下一次训练</small></div><span class="step-mark">↗</span></li>
      </ol>
    </section>

    <section id="architecture" class="section architecture-section">
      <div class="section-heading">
        <div class="section-index">03 / HOW IT IS BUILT</div>
        <div><h2>清晰的模块边界，<br />能复现的实现路径。</h2><p>网页和小程序共用 Node.js 服务端，模型调用、教学工具与学习状态集中编排。</p></div>
      </div>
      <div class="architecture">
        <div class="arch-node client-node"><span>01 · CLIENTS</span><b>Vue 3 Web</b><b>微信小程序</b><small>对话 · 训练 · 档案</small></div>
        <div class="arch-connector"><span>HTTP / SSE</span><i>→</i></div>
        <div class="arch-node server-node"><span>02 · ORCHESTRATION</span><b>Express API</b><b>Agent 编排</b><small>鉴权 · 媒体 · 状态</small></div>
        <div class="arch-connector"><span>TOOLS</span><i>→</i></div>
        <div class="arch-node model-node"><span>03 · CAPABILITIES</span><b>LLM / VLM</b><b>ASR / TTS</b><small>RAG · 教学工具 · JSON 档案</small></div>
      </div>
      <div class="architecture-note"><span>REPRODUCIBLE</span><p>Node.js 18+ · 无需数据库 · 配置 AI 服务可选</p><span class="readme-note">本地复现步骤见仓库根目录 README</span></div>
    </section>

    <footer class="project-footer">
      <div><span class="brand-glyph">한</span><b>한국어 친구</b><small>每一次表达，都是下一次进步的证据。</small></div>
      <button @click="enter">进入学习空间 ↗</button>
    </footer>
  </main>
</template>

<style scoped>
.project-page { --paper: #f4f3ef; --dark: #17232a; --muted: #667278; --blue: #145e78; color: var(--dark); background: var(--paper); min-height: 100dvh; overflow: hidden; }
.project-nav { height: 76px; max-width: 1160px; padding: 0 30px; margin: auto; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(23,35,42,.11); }
.project-brand { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; letter-spacing: .02em; }
.brand-glyph { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; color: white; background: var(--dark); font-size: 15px; }
.nav-right { display: flex; align-items: center; gap: clamp(16px,3vw,38px); font-size: 12px; color: var(--muted); }
.nav-right a:hover,.text-action:hover { color: var(--blue); }
.nav-cta { padding: 10px 15px; border: 1px solid rgba(23,35,42,.22); border-radius: 4px; color: var(--dark); font-weight: 650; }
.nav-cta span { margin-left: 10px; color: var(--blue); }
.project-hero { position: relative; max-width: 1160px; margin: auto; padding: clamp(72px,10vw,130px) 30px 104px; display: grid; grid-template-columns: 1.1fr .9fr; gap: 52px; align-items: center; }
.eyebrow,.section-index { font-size: 10px; font-weight: 700; letter-spacing: .14em; color: var(--blue); }
.eyebrow { display: flex; align-items: center; gap: 9px; }
.eyebrow-dot { width: 7px; height: 7px; background: #c46e50; border-radius: 50%; box-shadow: 0 0 0 4px rgba(196,110,80,.12); }
.hero-copy h1 { margin: 24px 0 18px; font-size: clamp(37px,6vw,68px); line-height: 1.18; letter-spacing: -.07em; font-weight: 700; }
.hero-copy h1 em { font-style: normal; color: var(--blue); }
.hero-description { max-width: 480px; margin: 0; font-size: 15px; line-height: 1.9; color: var(--muted); }
.hero-actions { display: flex; align-items: center; gap: 25px; margin-top: 30px; }
.primary-action,.outline-action { padding: 14px 19px; background: var(--dark); color: white; border-radius: 4px; font-size: 13px; font-weight: 650; }
.primary-action span,.outline-action span { margin-left: 19px; color: #9dc3ce; }
.text-action { color: var(--muted); font-size: 12px; }
.text-action span { padding-left: 5px; }
.hero-meta { display: flex; gap: 12px; align-items: center; margin-top: 48px; font-size: 9px; color: #8b969a; letter-spacing: .08em; }
.hero-meta i { width: 3px; height: 3px; border-radius: 50%; background: #9ba5a7; }
.loop-card { position: relative; padding: 22px; background: #fffefa; border: 1px solid rgba(23,35,42,.12); box-shadow: 15px 20px 0 rgba(26,54,62,.06); transform: rotate(1.5deg); }
.loop-card-head { display: flex; justify-content: space-between; color: #879194; font-size: 9px; letter-spacing: .11em; }
.status-light { color: #367967; letter-spacing: 0; }
.loop-quote { margin-top: 35px; padding: 18px 17px; background: #f3f5f1; color: #19313a; font: 500 20px/1.4 Georgia,serif; letter-spacing: -.02em; }
.loop-translation { display: flex; justify-content: space-between; margin-top: 9px; font-size: 11px; color: #778287; }
.loop-translation span { color: #367967; }
.loop-rule { height: 1px; background: #e6e9e4; margin: 28px 0 19px; }
.loop-insight { display: flex; gap: 12px; align-items: center; }
.insight-icon { width: 31px; height: 31px; display: grid; place-items: center; background: #e7f0ee; border-radius: 50%; color: #347b68; }
.loop-insight b,.loop-insight small { display: block; }
.loop-insight b { font-size: 12px; }
.loop-insight small { margin-top: 3px; font-size: 10px; color: #828d90; }
.loop-path { display: flex; align-items: center; gap: 8px; margin-top: 30px; color: #758185; font-size: 9px; }
.loop-path span { white-space: nowrap; }.loop-path b { margin-right: 4px; color: var(--blue); }.loop-path i { height: 1px; flex: 1; background: #d8dfdc; }
.hero-index { position: absolute; right: 32px; bottom: 28px; font-size: 9px; line-height: 1.7; letter-spacing: .16em; color: #a6aeac; text-align: right; }
.section { max-width: 1160px; margin: auto; padding: 94px 30px; }
.approach-section { border-top: 1px solid rgba(23,35,42,.12); }
.section-heading { display: grid; grid-template-columns: 1fr 2fr; gap: 32px; margin-bottom: 37px; }
.section-heading h2,.demo-copy h2 { margin: 0; font-size: clamp(29px,4vw,42px); line-height: 1.3; letter-spacing: -.055em; }
.section-heading p { margin: 12px 0 0; color: var(--muted); font-size: 13px; }
.feature-grid { display: grid; grid-template-columns: repeat(4,1fr); border-top: 1px solid #d6dcd8; border-bottom: 1px solid #d6dcd8; }
.feature-card { padding: 19px 20px 22px; border-right: 1px solid #d6dcd8; min-height: 230px; }.feature-card:first-child { border-left: 1px solid #d6dcd8; }
.feature-top { display: flex; justify-content: space-between; font: 11px Georgia,serif; color: var(--blue); }.feature-mark { color: #879194; font: 9px var(--font); }
.feature-card h3 { margin: 32px 0 12px; font-size: 17px; letter-spacing: -.04em; }.feature-card p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.85; }.feature-line { width: 27px; height: 2px; margin-top: 20px; background: #b8c8c7; }
.demo-section { display: grid; grid-template-columns: .9fr 1.1fr; gap: 9vw; padding: 75px max(30px,calc((100% - 1100px)/2)); background: #1b2d33; color: #f6f4ed; }
.demo-copy .section-index { color: #a8cbc8; }.demo-copy h2 { margin-top: 17px; }.demo-copy p { max-width: 430px; margin: 17px 0 24px; color: #bdc8c5; font-size: 12px; line-height: 1.9; }.outline-action { border: 1px solid #788c8e; background: transparent; }
.demo-steps { padding: 0; margin: 0; list-style: none; align-self: center; }.demo-steps li { display: grid; grid-template-columns: 34px 1fr 20px; align-items: center; gap: 12px; padding: 18px 0; border-bottom: 1px solid rgba(255,255,255,.17); }.demo-steps li:first-child { border-top: 1px solid rgba(255,255,255,.17); }.demo-steps li>span:first-child { color: #a8cbc8; font: 12px Georgia,serif; }.demo-steps b,.demo-steps small { display: block; }.demo-steps b { font-size: 13px; font-weight: 600; }.demo-steps small { margin-top: 4px; color: #aab8b5; font-size: 10px; }.step-mark { color: #a8cbc8; }
.architecture-section { padding-top: 97px; padding-bottom: 75px; }.architecture { display: grid; grid-template-columns: 1fr 85px 1fr 85px 1fr; align-items: center; }.arch-node { min-height: 151px; padding: 18px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 5px; border: 1px solid #cfd8d4; background: rgba(255,255,255,.4); }.arch-node>span { margin-bottom: 8px; font-size: 8px; letter-spacing: .12em; color: #7c898c; }.arch-node b { font-size: 14px; }.arch-node small { margin-top: 6px; font-size: 10px; color: var(--muted); }.server-node { background: #e6eeeb; border-color: #a9bfba; }.model-node { background: #edf0e9; }.arch-connector { display: flex; flex-direction: column; align-items: center; color: #7e8b8b; font-size: 8px; letter-spacing: .1em; }.arch-connector i { margin-top: 4px; color: var(--blue); font-size: 20px; font-style: normal; }
.architecture-note { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-top: 18px; padding: 15px 17px; background: #e9e9e2; font-size: 10px; }.architecture-note>span:first-child { color: var(--blue); font-size: 8px; letter-spacing: .12em; }.architecture-note p { margin: 0; color: var(--muted); }.architecture-note .readme-note { white-space: nowrap; color: var(--blue); font-size: 10px; letter-spacing: 0; }
.project-footer { max-width: 1160px; margin: auto; padding: 24px 30px 31px; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #d4dad6; }.project-footer>div { display: grid; grid-template-columns: 30px auto; align-items: center; gap: 0 9px; }.project-footer .brand-glyph { grid-row: span 2; }.project-footer b { font-size: 11px; }.project-footer small { color: #869194; font-size: 9px; }.project-footer button { color: var(--blue); font-size: 11px; }
@media (max-width: 760px) { .project-nav { height: 64px; padding: 0 18px; }.nav-right { gap: 14px; }.nav-right>a { display: none; }.nav-cta { padding: 8px 10px; }.project-hero { padding: 60px 22px 76px; grid-template-columns: 1fr; gap: 40px; }.hero-copy h1 { font-size: clamp(37px,9vw,55px); }.hero-description { font-size: 13px; }.hero-meta { margin-top: 31px; }.loop-card { max-width: 500px; width: calc(100% - 10px); margin: auto; }.hero-index { right: 22px; bottom: 24px; }.section { padding: 65px 22px; }.section-heading { grid-template-columns: 1fr; gap: 14px; }.feature-grid { grid-template-columns: repeat(2,1fr); }.feature-card { min-height: 220px; padding: 17px 14px; }.feature-card:nth-child(3) { border-left: 1px solid #d6dcd8; }.feature-card:nth-child(n+3) { border-top: 1px solid #d6dcd8; }.demo-section { grid-template-columns: 1fr; gap: 34px; padding: 58px 22px; }.architecture { grid-template-columns: 1fr; gap: 10px; }.arch-node { min-height: 124px; }.arch-connector { flex-direction: row-reverse; justify-content: center; gap: 8px; }.arch-connector i { margin: 0; transform: rotate(90deg); }.architecture-note { align-items: flex-start; flex-direction: column; }.project-footer { padding: 20px 22px 28px; }.project-footer small { max-width: 190px; } }
@media (prefers-reduced-motion: reduce) { *,*::before,*::after { scroll-behavior: auto !important; transition-duration: .01ms !important; } }
</style>
