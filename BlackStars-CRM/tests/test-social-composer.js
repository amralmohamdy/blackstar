// v6.472 — Social Composer: compose a post once (media + caption + link) and share to each platform
// in one click. Client-side only. Platforms with a web-share URL (FB/X/WhatsApp/Telegram/LinkedIn)
// open pre-filled; Instagram/TikTok/YouTube have no web post API so those download the media + copy
// the caption. A device-local post log keeps a history. This locks the share-URL builder, the route,
// and the render.
const H = require('./qc-harness.js');
const R = H.reporter('SOCIAL · composer + share');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('source wiring');
{
  const app = H.readSrc();
  R.ok('the social route is registered (Engagement, admin-only)', /social:\s*\{ label: 'Social Media'[\s\S]{0,80}adminOnly: true/.test(app));
  R.ok('PAGES.social is admin-gated', /PAGES\.social = \(main\) => \{[\s\S]{0,120}currentRole\(\) !== 'admin'/.test(app));
  R.ok('8 platforms are defined', /SOCIAL_PLATFORMS = \[[\s\S]{0,600}youtube/.test(app));
  R.ok('share buttons call _socialShare', /onclick="_socialShare\('\$\{p\.id\}'\)"/.test(app));
  R.ok('IG/TikTok/YouTube download media + copy caption (no web post)', /\['instagram', 'tiktok', 'youtube'\]\.includes\(platform\)/.test(app) && /_socialDownloadMedia\(\)[\s\S]{0,120}clipboard\.writeText\(caption\)/.test(app));
  R.ok('a device-local post log is kept', /SOCIAL_LOG_KEY = 'blackstars-social-posts'/.test(app));
}

R.section('the share-URL builder is correct per platform');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const urls = run(ctx, `
    (function(){
      const cap = 'Come train with us! #BlackStars';
      const link = 'https://www.blackstarssports.com';
      const out = {};
      for (const p of ['facebook','x','whatsapp','telegram','linkedin','instagram','tiktok','youtube']) out[p] = _socialShareURL(p, cap, link);
      return out;
    })()
  `);
  R.ok('Facebook shares the link (sharer)', /facebook\.com\/sharer\/sharer\.php\?u=https/.test(urls.facebook), urls.facebook);
  R.ok('X prefills text + url', /twitter\.com\/intent\/tweet\?text=Come%20train/.test(urls.x) && /&url=https/.test(urls.x), urls.x);
  R.ok('WhatsApp prefills the caption', /wa\.me\/\?text=Come%20train/.test(urls.whatsapp), urls.whatsapp);
  R.ok('Telegram prefills url + text', /t\.me\/share\/url\?url=https[\s\S]*text=Come%20train/.test(urls.telegram), urls.telegram);
  R.ok('LinkedIn shares the link', /linkedin\.com\/sharing\/share-offsite\/\?url=https/.test(urls.linkedin), urls.linkedin);
  R.ok('Instagram opens the app (no web post)', urls.instagram === 'https://www.instagram.com/', urls.instagram);
  R.ok('TikTok opens the upload page', urls.tiktok === 'https://www.tiktok.com/upload', urls.tiktok);
  R.ok('YouTube opens Studio', urls.youtube === 'https://studio.youtube.com/', urls.youtube);
  R.ok('the caption is URL-encoded (no raw spaces/#)', !/ /.test(urls.x) && !/#/.test(urls.x), urls.x);
}

R.section('post log + render');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const res = run(ctx, `
    (function(){
      try { localStorage.removeItem('blackstars-social-posts'); } catch(_){}
      // stub the composer inputs the save reads
      document.getElementById = (id) => ({ value: id==='soc-caption' ? 'Hello world' : (id==='soc-link' ? 'https://x.co' : '') });
      window.toast = () => {}; window.render = () => {};
      _socialSavePost();
      const log = _socialLog();
      return { count: log.length, caption: log[0] && log[0].caption };
    })()
  `);
  R.ok('saving adds a post to the log', res.count === 1 && res.caption === 'Hello world', JSON.stringify(res));

  const rendered = H.renderScreen(ctx, 'social');
  R.ok('the Social screen renders', rendered.ok && /Social Media/.test(rendered.html) && /_socialShare/.test(rendered.html), rendered.error);
}

R.done();
