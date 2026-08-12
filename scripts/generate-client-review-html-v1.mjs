import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "artifacts", "client-review-v1.0");

function dataUri(fileName) {
  const filePath = join(root, "public", "images", fileName);
  return `data:image/png;base64,${readFileSync(filePath).toString("base64")}`;
}

const images = {
  hero: dataUri("hero-products-placeholder-v1.png"),
  company: dataUri("company-craft-placeholder-v1.png"),
  product: dataUri("product-catalog-placeholder-v1.png"),
  custom: dataUri("custom-development-placeholder-v1.png"),
  symbol: dataUri("shuangfu-symbol-v1.png"),
  wordmark: dataUri("shuangfu-wordmark-zh-v1.png"),
};

const icon = (name) => {
  const paths = {
    arrow: '<path d="M7 7h10v10M7 17 17 7"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4 4-2Z"/>',
    package: '<path d="m16.5 9.4-9-5.2M21 8 12 13 3 8M12 22V13"/><path d="M20 7.5v9l-8 4.5-8-4.5v-9L12 3l8 4.5Z"/>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
    pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7A2 2 0 0 1 22 16.9Z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
};

const products = Array.from({ length: 14 }, (_, index) => ({
  index: index + 1,
  code: `SF-${String(index + 1).padStart(3, "0")}`,
}));

function productCards(category) {
  const label = category === "pads" ? "胸垫" : "罩杯";
  return products.map(({ index, code }) => `
    <button class="product-card ${index > 8 ? "extra-product" : ""}" data-product="${label} ${String(index).padStart(2, "0")}" data-code="${code}" type="button">
      <span class="product-image" role="img" aria-label="${label}产品设计占位图"></span>
      <span>${label} ${String(index).padStart(2, "0")}</span>
      <small>${code}</small>
    </button>`).join("");
}

const styles = `
  :root{--ink:#231d1f;--muted:#73686c;--wine:#8b3348;--wine-dark:#652235;--blush:#f7eeee;--line:#dfd5d6;--paper:#fffdfc;--max:1240px}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",Arial,sans-serif}body.desktop-review{min-width:1180px}
  a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}button,a{-webkit-tap-highlight-color:transparent}img{display:block;max-width:100%}svg{height:22px;width:22px}
  .site-header{align-items:center;background:rgba(255,253,252,.94);border-bottom:1px solid rgba(223,213,214,.8);display:flex;height:84px;justify-content:space-between;padding:0 max(28px,calc((100vw - var(--max))/2));position:sticky;top:0;z-index:40;backdrop-filter:blur(14px)}
  .brand-lockup{align-items:center;display:flex;gap:12px}.brand-symbol{height:38px;object-fit:contain;width:48px}.brand-wordmark{height:auto;width:58px}.site-header nav{display:flex;gap:34px}.site-header nav a{color:#554c4f;font-size:14px}.site-header nav a:hover{color:var(--wine)}
  .language{align-items:center;background:#fff;border:1px solid var(--line);border-radius:999px;display:flex;font-size:13px;font-weight:600;gap:8px;min-height:44px;padding:0 16px}.language svg{height:16px;width:16px}
  .hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(480px,.9fr);min-height:730px;overflow:hidden}.hero-copy{align-self:center;max-width:720px;padding:100px 7vw 100px max(32px,calc((100vw - var(--max))/2))}
  .hero-image{min-height:650px;position:relative}.hero-image>img{height:100%;object-fit:cover;position:absolute;width:100%}.placeholder-note{background:rgba(35,29,31,.82);bottom:20px;color:#fff;font-size:11px;left:20px;line-height:1.5;max-width:480px;padding:10px 12px;position:absolute}
  .eyebrow{color:var(--wine);font-size:11px;font-weight:700;letter-spacing:.18em;margin:0 0 22px;text-transform:uppercase}h1,h2,h3,p{margin-top:0}h1{font-size:clamp(50px,5.4vw,82px);font-weight:560;letter-spacing:-.055em;line-height:1.07;margin-bottom:30px}h1 span{display:block}.hero-intro,.section-lead,.section-heading>p:last-child{color:var(--muted);font-size:17px;line-height:1.85;max-width:680px}
  .hero-actions{display:flex;gap:12px;margin-top:42px}.button{align-items:center;border:1px solid transparent;cursor:pointer;display:inline-flex;gap:12px;justify-content:center;min-height:48px;padding:0 24px;transition:.2s}.button svg{height:17px;width:17px}.button-primary{background:var(--wine);color:#fff}.button-primary:hover{background:var(--wine-dark);transform:translateY(-1px)}.button-ghost{background:transparent;border-color:var(--line)}.button-ghost:hover{border-color:var(--wine);color:var(--wine)}
  .section{margin:auto;max-width:var(--max);padding:124px 28px}.section h2{font-size:clamp(36px,4vw,58px);font-weight:560;letter-spacing:-.045em;line-height:1.14;max-width:820px}.about{align-items:center;display:grid;gap:9vw;grid-template-columns:1fr .82fr}.about figure{margin:0}.about figure img{aspect-ratio:4/5;object-fit:cover;width:100%}.about figcaption{color:var(--muted);font-size:10px;line-height:1.5;margin-top:9px}
  .facts{border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(3,1fr);margin-top:50px;padding-top:30px}.facts div{display:flex;flex-direction:column;gap:8px}.facts strong{color:var(--wine);font-size:26px;font-weight:600}.facts span{color:var(--muted);font-size:12px}
  .products{background:var(--blush);max-width:none;padding-left:max(28px,calc((100vw - var(--max))/2));padding-right:max(28px,calc((100vw - var(--max))/2))}.section-heading{margin-bottom:58px}.product-catalog{border-top:1px solid #d8c5c8}.product-category{border-bottom:1px solid #d8c5c8}.category-heading{align-items:center;display:flex;justify-content:space-between;padding:28px 0}.category-heading h3{font-size:27px;font-weight:560;letter-spacing:-.025em;margin:0}.category-heading small{color:var(--muted);display:block;font-size:13px;margin-top:8px}.category-heading>em{color:var(--wine);font-size:13px;font-style:normal}.category-content{padding:12px 0 44px}.product-grid{display:grid;gap:16px;grid-template-columns:repeat(4,1fr)}.product-card{background:#fff;border:1px solid transparent;color:inherit;cursor:pointer;padding:0 0 16px;text-align:left;transition:.2s}.product-card:hover{border-color:var(--wine);transform:translateY(-2px)}.product-card .product-image{aspect-ratio:1;background-image:var(--product-image);background-position:center;background-size:cover;display:block;padding:0;width:100%}.product-card>span:not(.product-image){display:block;font-size:14px;font-weight:600;padding:14px 14px 0}.product-card small{color:var(--muted);display:block;font-size:10px;padding:5px 14px 0}.extra-product{display:none}.product-grid.expanded .extra-product{display:block}.load-more{margin:28px auto 0}
  .custom-scope{background:#fff;display:grid;grid-template-columns:1fr 1fr}.custom-scope>div{align-self:center;padding:54px}.custom-scope h3{font-size:32px;font-weight:560}.custom-scope ul{display:grid;gap:10px;grid-template-columns:1fr 1fr;list-style:none;margin:30px 0;padding:0}.custom-scope li{border-bottom:1px solid var(--line);padding:10px 0}.custom-scope img{height:100%;object-fit:cover;width:100%}
  .advantage-grid{display:grid;grid-template-columns:repeat(4,1fr)}.advantage-grid article{border-left:1px solid var(--line);min-height:300px;padding:20px 28px}.advantage-grid article>span{color:#b6aaad;font-size:11px;letter-spacing:.16em}.advantage-grid svg{color:var(--wine);height:28px;margin:50px 0 24px;width:28px}.advantage-grid h3{font-size:20px;font-weight:600}.advantage-grid p{color:var(--muted);font-size:14px;line-height:1.7}
  .contact{align-items:start;background:var(--wine-dark);color:#fff;display:grid;gap:8vw;grid-template-columns:.75fr 1.25fr;max-width:none;padding-left:max(28px,calc((100vw - var(--max))/2));padding-right:max(28px,calc((100vw - var(--max))/2))}.contact .eyebrow{color:#e9cbd2}.contact h2{font-size:48px}.contact dl{margin-top:60px}.contact dl div{display:grid;gap:3px 12px;grid-template-columns:24px 90px 1fr;margin:20px 0}.contact dt{color:#d5b9c0;font-size:12px}.contact dd{font-size:14px;margin:0}.contact svg{height:18px;width:18px}
  .inquiry-form{background:var(--paper);color:var(--ink);padding:48px}.inquiry-form header h2{font-size:32px}.inquiry-form header>p:last-child{color:var(--muted);line-height:1.6}.form-grid{display:grid;gap:18px;grid-template-columns:1fr 1fr;margin-top:30px}.form-grid label{color:#574d50;display:flex;flex-direction:column;font-size:12px;gap:8px}.form-grid input,.form-grid select,.form-grid textarea{background:#fff;border:1px solid var(--line);border-radius:0;color:var(--ink);min-height:45px;padding:10px 12px;width:100%}.form-grid textarea{resize:vertical}.form-span{grid-column:1/-1}.required{color:var(--wine);font-weight:700}.consent{align-items:flex-start;color:var(--muted);display:flex;font-size:12px;gap:9px;line-height:1.5;margin:18px 0}.form-status{background:#f1e7e9;color:var(--wine-dark);display:none;font-size:13px;margin:0 0 15px;padding:10px 12px}
  footer{align-items:center;background:#241d1f;color:#fff;display:flex;justify-content:space-between;padding:40px max(28px,calc((100vw - var(--max))/2))}footer p{color:#bdb0b4;font-size:11px;margin:0}.review-label{border:1px solid #66585d;padding:7px 10px}
  dialog{background:#fff;border:0;box-shadow:0 24px 80px rgba(35,29,31,.28);max-height:calc(100vh - 56px);max-width:1050px;padding:0;width:calc(100% - 56px)}dialog::backdrop{background:rgba(35,29,31,.72)}.detail{display:grid;grid-template-columns:1fr 1fr;position:relative}.detail-image{background-image:var(--product-image);background-position:center;background-size:cover;min-height:560px}.detail-copy{align-self:center;padding:54px}.detail-copy h3{font-size:32px}.detail-copy p{color:var(--muted);line-height:1.75}.detail-copy dl{border-top:1px solid var(--line);margin:30px 0}.detail-copy dl div{border-bottom:1px solid var(--line);display:grid;font-size:13px;grid-template-columns:120px 1fr;padding:12px 0}.detail-copy dt{color:var(--muted)}.detail-copy dd{margin:0}.dialog-close{align-items:center;background:#fff;border:1px solid var(--line);cursor:pointer;display:flex;height:40px;justify-content:center;position:absolute;right:18px;top:18px;width:40px;z-index:2}.dialog-close svg{height:18px;width:18px}
  .mobile-review{margin:0 auto;max-width:430px;min-width:320px}.mobile-review .site-header{height:68px;padding:0 18px}.mobile-review .site-header nav{display:none}.mobile-review .brand-symbol{height:34px;width:42px}.mobile-review .brand-wordmark{width:54px}.mobile-review .language{min-height:40px;padding:0 13px}
  .mobile-review .hero{display:flex;flex-direction:column;min-height:auto}.mobile-review .hero-image{min-height:360px;order:-1}.mobile-review .hero-copy{padding:72px 20px 54px}.mobile-review h1{font-size:40px}.mobile-review .hero-intro{font-size:15px}.mobile-review .hero-actions .button{flex:1;padding:0 14px}.mobile-review .placeholder-note{bottom:20px;left:20px;right:20px}
  .mobile-review .section{padding:88px 20px}.mobile-review .section h2{font-size:36px}.mobile-review .about{gap:50px;grid-template-columns:1fr}.mobile-review .about figure{order:-1}.mobile-review .facts{gap:12px}.mobile-review .facts strong{font-size:21px}
  .mobile-review .products{padding-left:20px;padding-right:20px}.mobile-review .category-heading{align-items:flex-start;gap:14px}.mobile-review .category-heading h3{font-size:22px}.mobile-review .category-heading small{max-width:230px}.mobile-review .product-grid{gap:9px;grid-template-columns:repeat(2,1fr)}.mobile-review .product-card span{font-size:12px;padding:10px 10px 0}.mobile-review .product-card small{padding:4px 10px 0}.mobile-review .product-card:nth-child(n+5){display:none}.mobile-review .product-grid.expanded .product-card{display:block}
  .mobile-review .custom-scope{grid-template-columns:1fr}.mobile-review .custom-scope>div{padding:30px 20px 36px}.mobile-review .custom-scope img{aspect-ratio:1.2;grid-row:1}.mobile-review .custom-scope h3{font-size:27px}.mobile-review .advantage-grid{grid-template-columns:1fr}.mobile-review .advantage-grid article{border-left:0;border-top:1px solid var(--line);min-height:auto;padding:28px 0}.mobile-review .advantage-grid svg{margin:26px 0 18px}
  .mobile-review .contact{gap:54px;grid-template-columns:1fr}.mobile-review .contact h2{font-size:36px}.mobile-review .contact dl div{grid-template-columns:22px 1fr}.mobile-review .contact dd{grid-column:2}.mobile-review .inquiry-form{padding:28px 20px}.mobile-review .form-grid{grid-template-columns:1fr}.mobile-review .form-span{grid-column:auto}.mobile-review footer{align-items:flex-start;flex-direction:column;gap:22px;padding:36px 20px}
  .mobile-review dialog{max-height:calc(100vh - 28px);width:calc(100% - 28px)}.mobile-review dialog .detail{grid-template-columns:1fr}.mobile-review dialog .detail-image{aspect-ratio:1.1;min-height:0}.mobile-review dialog .detail-copy{padding:28px 20px 34px}
  @media(min-width:700px){body.mobile-review{box-shadow:0 0 60px rgba(35,29,31,.15)}}
  @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition:none!important}}
`;

function page(layout) {
  const isMobile = layout === "mobile";
  const layoutLabel = isMobile ? "移动端" : "网页端";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>双芙官网｜${layoutLabel}客户评审稿 V1.0</title>
  <style>:root{--product-image:url("${images.product}")}${styles}</style>
</head>
<body class="${layout}-review">
  <!-- 双芙企业官网客户评审稿 V1.0 · 2026-07-27 · 图片及产品内容为设计占位 -->
  <header class="site-header">
    <a class="brand-lockup" href="#top" aria-label="双芙首页"><img class="brand-symbol" src="${images.symbol}" alt=""><img class="brand-wordmark" src="${images.wordmark}" alt="双芙"></a>
    <nav><a href="#about">企业介绍</a><a href="#products">产品介绍</a><a href="#advantages">合作优势</a><a href="#contact">联系我们</a></nav>
    <button class="language" type="button" data-review-message="评审稿当前展示中文版本；正式官网支持中文、英文和阿拉伯文。">中文⌄</button>
  </header>
  <main id="top">
    <section class="hero">
      <div class="hero-copy"><p class="eyebrow">LINGERIE COMPONENTS · SINCE 2021</p><h1><span>贴近身体的柔软，</span><span>始于看不见的工艺。</span></h1><p class="hero-intro">专注胸垫、罩杯及服装服饰辅料制造，为品牌与制造商提供稳定、灵活且可持续迭代的产品支持。</p><div class="hero-actions"><a class="button button-primary" href="#products">探索产品 ${icon("arrow")}</a><a class="button button-ghost" href="#inquiry">洽谈合作</a></div></div>
      <div class="hero-image"><img src="${images.hero}" alt="胸垫与罩杯产品设计占位图"><span class="placeholder-note">当前图片与产品内容为设计占位，正式发布前将替换为公司确认素材。</span></div>
    </section>
    <section class="section about" id="about">
      <div><p class="eyebrow">ABOUT SHUANGFU</p><h2>以稳定制造，承接每一次贴身创意</h2><p class="section-lead">六安市双芙服装辅料有限公司成立于 2021 年，位于安徽六安。我们围绕胸垫、罩杯与相关辅料，提供从选型、打样到批量生产的协作支持。</p><div class="facts"><div><strong>2021</strong><span>成立年份</span></div><div><strong>3</strong><span>核心服务方向</span></div><div><strong>多规格</strong><span>灵活开发能力</span></div></div></div>
      <figure><img src="${images.company}" alt="公司工艺设计占位图"><figcaption>当前图片为设计占位，正式发布前将替换为公司确认素材。</figcaption></figure>
    </section>
    <section class="section products" id="products">
      <header class="section-heading"><p class="eyebrow">PRODUCTS</p><h2>从基础结构到定制开发</h2><p>胸垫与罩杯默认展示两行产品，可加载更多；定制开发范围直接展示。每件产品均可带入合作咨询。</p></header>
      <div class="product-catalog">
        <section class="product-category"><div class="category-heading"><span><h3>胸垫</h3><small>查看胸垫产品图片、介绍与规格。</small></span><em>共 14 款</em></div><div class="category-content"><div class="product-grid">${productCards("pads")}</div><button class="button button-ghost load-more" type="button">加载更多</button></div></section>
        <section class="product-category"><div class="category-heading"><span><h3>罩杯</h3><small>查看罩杯产品图片、介绍与规格。</small></span><em>共 14 款</em></div><div class="category-content"><div class="product-grid">${productCards("cups")}</div><button class="button button-ghost load-more" type="button">加载更多</button></div></section>
        <section class="product-category"><div class="category-heading"><span><h3>定制开发</h3><small>查看可由后台维护的定制维度与流程。</small></span></div><div class="custom-scope"><div><h3>定制开发范围</h3><ul><li>产品类型</li><li>外形轮廓</li><li>尺寸规格</li><li>厚度结构</li><li>表面面料</li><li>颜色</li><li>包装与标识</li><li>其他需求</li></ul><a class="button button-primary" href="#inquiry">提交定制需求</a></div><img src="${images.custom}" alt="定制开发设计占位图"></div></section>
      </div>
    </section>
    <section class="section advantages" id="advantages">
      <header class="section-heading"><p class="eyebrow">WHY SHUANGFU</p><h2>把复杂的开发过程，变成可靠的协作</h2></header>
      <div class="advantage-grid">
        <article><span>01</span>${icon("layers")}<h3>专注品类</h3><p>围绕胸垫、罩杯与贴身服饰辅料积累制造经验。</p></article>
        <article><span>02</span>${icon("compass")}<h3>灵活打样</h3><p>按结构、尺寸、厚度、面料与颜色协同开发。</p></article>
        <article><span>03</span>${icon("package")}<h3>稳定交付</h3><p>以明确规格和过程沟通支持持续生产。</p></article>
        <article><span>04</span>${icon("message")}<h3>快速响应</h3><p>从产品咨询到开发确认，保持直接、清晰的沟通。</p></article>
      </div>
    </section>
    <section class="section contact" id="contact">
      <div><p class="eyebrow">CONTACT</p><h2>从一个样品需求开始合作</h2><dl><div>${icon("pin")}<dt>地址</dt><dd>安徽省六安市裕安区新安镇陈集村三棵松组</dd></div><div>${icon("phone")}<dt>电话</dt><dd>155 0564 1268</dd></div><div>${icon("mail")}<dt>邮箱</dt><dd>15505641268@139.com</dd></div></dl></div>
      <form class="inquiry-form" id="inquiry"><header><p class="eyebrow">INQUIRY</p><h2>告诉我们您的合作需求</h2><p>提交后，我们会尽快与您联系。带 <span class="required">*</span> 为必填项。</p></header><div class="form-grid">
        <label>姓名 <span class="required">*</span><input required></label><label>公司 <span class="required">*</span><input required></label>
        <label>国家/地区代码 <span class="required">*</span><select required><option>CN · 中国</option><option>US · 美国</option><option>AE · 阿联酋</option></select></label><label>邮箱 <span class="required">*</span><input type="email" required></label>
        <label>电话 / WhatsApp <span class="required">*</span><input required></label><label>意向类目 <span class="required">*</span><select required><option>胸垫</option><option>罩杯</option><option>定制开发</option></select></label>
        <label>意向产品（选填）<select><option>请选择产品</option><option>胸垫 01</option><option>罩杯 01</option></select></label><label>预计数量 <span class="required">*</span><input required></label>
        <label class="form-span">留言（选填）<textarea rows="5"></textarea></label>
      </div><label class="consent"><input type="checkbox" required><span>我同意按照隐私政策处理本次咨询所需的信息。</span></label><p class="form-status">这是客户评审演示，表单不会发送或保存数据。</p><button class="button button-primary" type="submit">提交合作意向</button></form>
    </section>
  </main>
  <footer><div class="brand-lockup"><img class="brand-symbol" src="${images.symbol}" alt=""><img class="brand-wordmark" src="${images.wordmark}" alt="双芙"></div><p>© 2026 六安市双芙服装辅料有限公司</p><p class="review-label">CLIENT REVIEW · ${layoutLabel.toUpperCase()} · V1.0</p></footer>
  <dialog aria-labelledby="detail-title"><div class="detail"><button class="dialog-close" type="button" aria-label="关闭">${icon("close")}</button><div class="detail-image" role="img" aria-label="产品设计占位图"></div><div class="detail-copy"><p class="eyebrow">PRODUCT DETAIL</p><h3 id="detail-title">胸垫 01</h3><p>柔软贴合的基础胸垫结构，可根据品牌需求调整轮廓、尺寸、厚度、面料与颜色。</p><dl><div><dt>产品编号</dt><dd id="detail-code">SF-001</dd></div><div><dt>结构</dt><dd>一体成型</dd></div><div><dt>定制范围</dt><dd>尺寸 / 厚度 / 面料 / 颜色</dd></div></dl><a class="button button-primary dialog-inquiry" href="#inquiry">咨询该产品</a></div></div></dialog>
  <script>
    document.querySelectorAll(".load-more").forEach((button)=>button.addEventListener("click",()=>{button.previousElementSibling.classList.add("expanded");button.remove()}));
    const dialog=document.querySelector("dialog");
    document.querySelectorAll(".product-card").forEach((card)=>card.addEventListener("click",()=>{document.querySelector("#detail-title").textContent=card.dataset.product;document.querySelector("#detail-code").textContent=card.dataset.code;dialog.showModal()}));
    document.querySelector(".dialog-close").addEventListener("click",()=>dialog.close());
    document.querySelector(".dialog-inquiry").addEventListener("click",()=>dialog.close());
    dialog.addEventListener("click",(event)=>{if(event.target===dialog)dialog.close()});
    document.querySelector(".inquiry-form").addEventListener("submit",(event)=>{event.preventDefault();event.currentTarget.querySelector(".form-status").style.display="block"});
    document.querySelectorAll("[data-review-message]").forEach((button)=>button.addEventListener("click",()=>alert(button.dataset.reviewMessage)));
  </script>
</body>
</html>`;
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "shuangfu-website-desktop-review-v1.0.html"), page("desktop"));
writeFileSync(join(outputDir, "shuangfu-website-mobile-review-v1.0.html"), page("mobile"));

console.log(`Generated client review HTML V1.0 in ${outputDir}`);
