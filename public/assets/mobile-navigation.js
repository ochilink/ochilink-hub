/* Shared public mobile navigation for landing and booking pages. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
    @media(max-width:767px){
      .mobile-public-subnav{display:none!important}
      .mobile-public-container{min-height:64px;height:64px!important;flex-wrap:nowrap!important}
      .mobile-nav-actions>a,.mobile-nav-actions>button:not([aria-label^="Switch to"]):not(.ochi-mobile-toggle){display:none!important}
      .ochi-mobile-toggle{display:inline-flex!important;align-items:center;justify-content:center;width:40px;height:40px;border:1px solid rgba(148,163,184,.35);border-radius:12px;color:inherit;background:rgba(100,116,139,.1);cursor:pointer}
      .ochi-mobile-panel{position:absolute;top:100%;right:12px;left:12px;z-index:1000;padding:16px;background:#0B0F1A;color:white;border:1px solid #293549;border-radius:18px;box-shadow:0 18px 55px rgba(0,0,0,.45);display:grid;gap:9px;max-height:calc(100dvh - 90px);overflow-y:auto}
      .ochi-mobile-panel[hidden]{display:none!important}
      .ochi-mobile-panel a{display:flex;align-items:center;min-height:44px;padding:12px 16px;border:1px solid #283548;border-radius:12px;color:#F8FAFC;text-decoration:none;font-size:15px;font-weight:600}
      .ochi-mobile-panel a:first-child{background:#D6FF57;color:#0B0F1A;border-color:#D6FF57}
      .ochi-mobile-panel a:nth-child(2){background:#fff;color:#0B0F1A;border-color:#fff}
    }
    @media(min-width:768px){.ochi-mobile-toggle,.ochi-mobile-panel{display:none!important}}
  `;
  document.head.append(css);
  let panel, toggle, owner;
  const close = () => { if(panel){panel.hidden=true;toggle?.setAttribute('aria-expanded','false');} };
  function init(){
    const actions=document.querySelector('.mobile-nav-actions');
    const subnav=document.querySelector('.mobile-public-subnav');
    if(!actions||!subnav||actions.querySelector('.ochi-mobile-toggle'))return;
    owner=actions.closest('header')||actions.parentElement.parentElement;
    if(getComputedStyle(owner).position==='static')owner.style.position='relative';
    toggle=document.createElement('button');
    toggle.type='button';toggle.className='ochi-mobile-toggle';toggle.setAttribute('aria-label','Open navigation menu');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','ochi-mobile-panel');
    toggle.innerHTML='<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    panel=document.createElement('nav');panel.id='ochi-mobile-panel';panel.className='ochi-mobile-panel';panel.setAttribute('aria-label','Mobile navigation');panel.hidden=true;
    const links=[['Schedule','/booking'],['Login','/admin/'],['Apps',location.pathname==='/booking'?' /#apps':'#apps'],['Tech',location.pathname==='/booking'?' /#tech':'#tech'],['Consult',location.pathname==='/booking'?' /#consult':'#consult']];
    for(const [label,url] of links){const a=document.createElement('a');a.href=url.trim();a.textContent=label;panel.append(a);}
    actions.append(toggle);owner.append(panel);
    toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));});
    panel.addEventListener('click',e=>{if(e.target.closest('a'))close()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){close();toggle.focus()}});
    document.addEventListener('click',e=>{if(panel&&!panel.hidden&&!panel.contains(e.target)&&!toggle.contains(e.target))close()});
    window.addEventListener('resize',()=>{if(innerWidth>=768)close()});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  const observer=new MutationObserver(()=>{if(!document.querySelector('.ochi-mobile-toggle'))init()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
