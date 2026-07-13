/* AstroAura quick-view v3 — prefetch-on-hover, instant image, desktop only */
(function () {
  if (window.__aaQVInit) return; window.__aaQVInit = true;
  var SEL = '.media-btn[data-product-url], .cg-btn[data-product-url], .aa-pcard__qv-btn[data-product-url], .aa-pcard__media[data-product-url]';
  function isMobile(){ return window.matchMedia('(max-width:768px)').matches; }
  function money(c){ return '₹'+(c/100).toLocaleString('en-IN',{maximumFractionDigits:0}); }
  function imgUrl(u,w){ if(!u) return ''; if(u.indexOf('//')===0) u='https:'+u; return u+(u.indexOf('?')>-1?'&':'?')+'width='+w; }
  function findVariant(p,sel){ return p.variants.find(function(v){ return sel.every(function(s,i){ return s==null || v['option'+(i+1)]===s; }); }); }
  function optName(opt){ return (opt&&typeof opt==='object')?(opt.name||''):opt; }

  /* ---- prefetch + cache ---- */
  var JCACHE={};
  function keyOf(url){ return url.split('?')[0].replace(/\/$/,''); }
  function fetchProduct(url){
    var k=keyOf(url);
    if(!JCACHE[k]){ JCACHE[k]=fetch(k+'.js',{credentials:'same-origin'}).then(function(r){return r.json();}).catch(function(e){ delete JCACHE[k]; throw e; }); }
    return JCACHE[k];
  }
  function preload(src){ if(src){ var i=new Image(); i.src=src; } }
  function trigImg(btn){ var im=btn.querySelector&&btn.querySelector('img'); return im?(im.currentSrc||im.src):''; }
  function defaultImg(p){ var v=p.variants[0]; return (v&&v.featured_image&&v.featured_image.src)||p.featured_image||(p.images&&p.images[0]); }
  function prime(btn){
    var url=btn.getAttribute('data-product-url'); if(!url||url==='#') return;
    fetchProduct(url).then(function(p){ preload(imgUrl(defaultImg(p),760)); }).catch(function(){});
  }
  document.addEventListener('mouseover',function(e){
    if(isMobile()) return;
    var btn=e.target.closest&&e.target.closest(SEL);
    if(btn && !btn.__primed){ btn.__primed=1; prime(btn); }
  },true);

  /* ---- cart ---- */
  function updateCart(res){
    var s=(res&&res.sections)||{};
    var d=document.querySelector('cart-drawer');
    if(d && s['cart-drawer']){ var t=document.createElement('div'); t.innerHTML=s['cart-drawer']; var fr=t.querySelector('cart-drawer'); if(!fr){var w=t.querySelector('[id^="shopify-section-"]'); fr=w&&w.querySelector('cart-drawer');} if(fr){ d.innerHTML=fr.innerHTML; d.classList.toggle('is-empty',fr.classList.contains('is-empty')); } }
    var cb=document.querySelector('#cart-icon-bubble'); if(cb && s['cart-icon-bubble']){ var t2=document.createElement('div'); t2.innerHTML=s['cart-icon-bubble']; var inn=t2.querySelector('#cart-icon-bubble'); cb.innerHTML=inn?inn.innerHTML:t2.innerHTML; }
    return d;
  }
  function addToCart(modal,variant,btn){
    if(!variant) return; btn.disabled=true; btn.textContent='Adding…';
    if(typeof window.AA_addToCart==='function'){ if(modal) modal.removeAttribute('open'); try{ window.AA_addToCart(variant.id,1); }catch(e){} btn.disabled=false; btn.textContent='Add to cart'; return; }
    var fd=new FormData(); fd.append('id',variant.id); fd.append('quantity','1'); fd.append('sections','cart-icon-bubble,cart-drawer'); fd.append('sections_url',location.pathname);
    fetch('/cart/add.js',{method:'POST',credentials:'same-origin',headers:{'Accept':'application/json','X-Requested-With':'XMLHttpRequest'},body:fd})
      .then(function(r){return r.json();}).then(function(res){
        var d=updateCart(res);
        modal.removeAttribute('open');
        if(d && typeof d.open==='function'){ d.open(); } else if(d){ d.classList.remove('is-empty'); d.classList.add('animate','active'); document.body.classList.add('overflow-hidden'); }
        else { document.body.classList.remove('overflow-hidden'); }
      }).catch(function(){ window.location.href='/cart'; })
      .finally(function(){ btn.disabled=false; btn.textContent='Add to cart'; });
  }
  /* Razorpay Magic Checkout flow — mirrors the product-page Buy Now:
     clear cart -> add only this item -> click the checkout button (Razorpay's
     magic-shopify.js hooks it and opens its overlay for this single product).
     Fallback: a name=checkout form post that Razorpay also hooks. */
  function triggerCheckout(){
    var c=['.aac__checkout','[data-aac-checkout]','#CartDrawer-Checkout','button[name="checkout"]','.cart__checkout-button','#checkout','form#CartDrawer-Form button[type="submit"]','form#cart button[type="submit"]'];
    for(var i=0;i<c.length;i++){ var el=document.querySelector(c[i]); if(el && !el.disabled){ el.click(); return true; } }
    return false;
  }
  function buyNowFormPost(variantId){
    var f=document.createElement('form'); f.method='post'; f.action='/cart/add'; f.style.display='none';
    function add(n,v){ var i=document.createElement('input'); i.type='hidden'; i.name=n; i.value=v; f.appendChild(i); }
    add('id',variantId); add('quantity','1'); add('checkout','');
    document.body.appendChild(f); f.submit();
  }
  function buyNow(modal,variant,btn){
    if(!variant || btn.disabled) return; btn.disabled=true; btn.textContent='Redirecting…';
    try{ if(window.aaHeatmap) window.aaHeatmap.track('Web_Shopify_Buy_Now_Clicked',{'[Amplitude] Product Variant ID':variant.id,'[Amplitude] Product Price':(variant.price||0)/100,'Source':'quickview'}); }catch(e){}
    if(modal) modal.removeAttribute('open');
    var h={'Accept':'application/json','X-Requested-With':'XMLHttpRequest'};
    fetch('/cart/clear.js',{method:'POST',credentials:'same-origin',headers:h})
      .then(function(){ var fd=new FormData(); fd.append('id',variant.id); fd.append('quantity','1');
        return fetch('/cart/add.js',{method:'POST',credentials:'same-origin',headers:h,body:fd}); })
      .then(function(){ requestAnimationFrame(function(){ if(!triggerCheckout()){ buyNowFormPost(variant.id); } }); })
      .catch(function(){ buyNowFormPost(variant.id); });
  }
  /* prepaid-offer countdown — same logic/format as the PDP inline script,
     shares the __aaOfferCountdown guard so it runs once per page. */
  function startOfferCountdown(){
    if(window.__aaOfferCountdown) return; window.__aaOfferCountdown=true;
    function pad(n){ return n<10?'0'+n:''+n; }
    function tick(){
      var els=document.querySelectorAll('[data-aa-countdown]'); if(!els.length) return;
      var now=new Date(), end=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,0,0);
      var d=Math.max(0,end-now), h=Math.floor(d/3600000), m=Math.floor(d%3600000/60000), s=Math.floor(d%60000/1000);
      var txt=h+' hr : '+pad(m)+' min : '+pad(s)+' sec';
      for(var i=0;i<els.length;i++) els[i].textContent=txt;
    }
    tick(); setInterval(tick,1000);
  }
  function chips(p,sel){
    if(p.variants.length<=1 && p.options.length===1 && optName(p.options[0])==='Title') return '';
    var h='';
    p.options.forEach(function(opt,oi){
      var vals=[]; p.variants.forEach(function(v){ var x=v['option'+(oi+1)]; if(vals.indexOf(x)<0) vals.push(x); });
      h+='<div class="qv-opt"><span class="qv-opt-label">'+optName(opt)+'</span><div class="qv-opt-vals">';
      vals.forEach(function(val){ h+='<button type="button" class="qv-chip'+(sel[oi]===val?' is-sel':'')+'" data-oi="'+oi+'" data-val="'+String(val).replace(/"/g,'&quot;')+'">'+val+'</button>'; });
      h+='</div></div>';
    });
    return h;
  }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
  function sliderHTML(p,instantImg){
    /* Build from p.media (NOT p.images) so videos are included. Each item:
       {t:'img',src} or {t:'vid',mp4,poster}. */
    var items=[];
    var media=(p.media&&p.media.length)?p.media:null;
    if(media){
      media.forEach(function(m){
        if(m.media_type==='video' && m.sources && m.sources.length){
          var mp4=null;
          m.sources.forEach(function(src){ if(!mp4 && /mp4/.test(src.mime_type||src.format||'')) mp4=src.url; });
          if(mp4) items.push({t:'vid',mp4:mp4,poster:(m.preview_image&&m.preview_image.src)||''});
        } else if(m.media_type==='image'){
          items.push({t:'img',src:m.src||(m.preview_image&&m.preview_image.src)||''});
        }
      });
    } else {
      (p.images||[]).forEach(function(im){ items.push({t:'img',src:im}); });
    }
    if(!items.length) items.push({t:'img',src:defaultImg(p)});
    /* the card's already-decoded image paints slide 1 instantly */
    if(instantImg && items[0] && items[0].t==='img'){ items[0]={t:'img',src:null,instant:instantImg}; }
    var slides=items.map(function(it,i){
      if(it.t==='vid'){
        return '<video src="'+it.mp4+'" '+(it.poster?'poster="'+imgUrl(it.poster,760)+'" ':'')+'muted loop playsinline preload="metadata"></video>';
      }
      var src=it.instant||imgUrl(it.src,760);
      return '<img src="'+src+'" alt="'+esc(p.title)+'" loading="'+(i===0?'eager':'lazy')+'" decoding="async" fetchpriority="'+(i===0?'high':'auto')+'">';
    }).join('');
    var thumbsHTML='';
    if(items.length>1){
      thumbsHTML='<div class="qv-thumbs">'+items.map(function(it,i){
        var tsrc=it.t==='vid'?(it.poster?imgUrl(it.poster,140):''):(it.instant||imgUrl(it.src,140));
        return '<button type="button" class="qv-thumb'+(i===0?' is-sel':'')+(it.t==='vid'?' qv-thumb--vid':'')+'" data-i="'+i+'">'+(tsrc?'<img src="'+tsrc+'" alt="" loading="lazy" decoding="async">':'')+'</button>';
      }).join('')+'</div>';
    }
    var ar='<button type="button" class="aa-marr aa-marr--l" aria-label="Previous image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>'+'<button type="button" class="aa-marr aa-marr--r" aria-label="Next image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>';
    return thumbsHTML+'<div class="qv-stage"><div class="qv-slider">'+slides+'</div>'+(items.length>1?ar:'')+'</div>';
  }
  function render(modal,p,instantImg,feats,rating,hindi){
    var content=modal.querySelector('[id^="QuickAddInfo-"]'); if(!content) return;
    var sel=p.options.map(function(o,i){ return p.variants[0]['option'+(i+1)]; });
    /* build the slider ONCE so variant changes don't reset the swipe position */
    content.innerHTML='<div class="qv"><div class="qv-media">'+sliderHTML(p,instantImg)+'</div><div class="qv-info"></div></div>';
    var info=content.querySelector('.qv-info');
    var slider=content.querySelector('.qv-slider');
    function syncMedia(){
      if(!slider) return;
      var idx=Math.round(slider.scrollLeft/Math.max(1,slider.clientWidth));
      var ts=content.querySelectorAll('.qv-thumb');
      for(var i=0;i<ts.length;i++){ ts[i].classList.toggle('is-sel', i===idx); }
      var kids=slider.children;
      for(var k=0;k<kids.length;k++){
        if(kids[k].tagName==='VIDEO'){
          if(k===idx){ if(kids[k].paused) kids[k].play().catch(function(){}); }
          else if(!kids[k].paused){ kids[k].pause(); }
        }
      }
    }
    if(slider){ slider.addEventListener('scroll',syncMedia,{passive:true}); syncMedia(); }
    /* Offer is LIVE-SYNCED from the PDP's .aa-offers card (fetched once, cached on
       window) so the quick view always matches the product page — no hardcoded copy
       that drifts. It styles itself via the global aa-energised.css already on the page. */
    function fillOffer(){
      if(!info.querySelector('[data-qv-offer]')) return;
      function put(html){ var s=info.querySelector('[data-qv-offer]'); if(s && html){ s.innerHTML=html; startOfferCountdown(); } }
      if(window.__aaQVOffer!=null){ put(window.__aaQVOffer); return; }
      fetch(p.url,{credentials:'same-origin'}).then(function(r){return r.text();}).then(function(h){
        var d=document.createElement('div'); d.innerHTML=h;
        var el=d.querySelector('.aa-offers');
        window.__aaQVOffer = el ? el.outerHTML : '';
        put(window.__aaQVOffer);
      }).catch(function(){ window.__aaQVOffer=''; });
    }
    function paint(){
      var v=findVariant(p,sel)||p.variants[0];
      var price=v.price, cap=v.compare_at_price||p.compare_at_price, off=(cap&&cap>price)?Math.round((1-price/cap)*100):0;
      info.innerHTML=
        (p.type?'<div class="qv-cat">'+esc(p.type)+'</div>':'')
        +(hindi?'<p class="qv-hindi" lang="hi">'+esc(hindi)+'</p>':'')
        +'<h3 class="qv-title">'+esc(p.title)+'</h3>'
        +(rating?'<div class="qv-rev"><span class="qv-stars">&#9733;</span> '+esc(rating)+' rated by customers</div>':'')
        +'<div class="qv-pricerow">'
          +(cap&&cap>price?'<span class="qv-mrp">MRP <s>'+money(cap)+'</s></span>':'')
          +'<span class="qv-pricebig">'+money(price)+'</span>'
          +(off?'<span class="qv-offtag"><span>'+off+'% OFF</span></span>':'')
        +'</div>'
        +(v.available?'<div class="qv-offer-slot" data-qv-offer></div>':'')
        +chips(p,sel)
        +'<div class="qv-actions">'
        +'<button type="button" class="qv-add"'+(v.available?'':' disabled')+'>'+(v.available?'Add to cart':'Sold out')+'</button>'
        +(v.available?'<button type="button" class="qv-buy">Buy Now</button>':'')
        +'</div>'
        +'<div class="qv-svc"><span>&#10003; Free shipping</span><span>&#10003; COD available</span><span>&#10003; 7-day returns</span><span>&#10003; Lab certified</span></div>'
        +'<a class="qv-link" href="'+p.url+'">View full details &rarr;</a>';
      if(v.available) fillOffer();
    }
    content.onclick=function(e){
      var th=e.target.closest('.qv-thumb'); if(th){ var i=+th.dataset.i; var im=slider&&slider.children[i]; if(im){ slider.scrollTo({left:im.offsetLeft,behavior:'smooth'}); } return; }
      var cp=e.target.closest('.aa-offer__copy'); if(cp){ var code=cp.getAttribute('data-code'); if(code){ try{navigator.clipboard.writeText(code);}catch(_){} var ot=cp.textContent; cp.textContent='Copied ✓'; setTimeout(function(){cp.textContent=ot;},1200); } return; }
      var c=e.target.closest('.qv-chip'); if(c){ sel[+c.dataset.oi]=c.dataset.val; paint(); return; }
      var b=e.target.closest('.qv-buy'); if(b){ buyNow(modal,findVariant(p,sel)||p.variants[0],b); return; }
      var a=e.target.closest('.qv-add'); if(a && !a.disabled){ addToCart(modal,findVariant(p,sel)||p.variants[0],a); }
    };
    paint();
  }
  function openModal(modal,url,instantImg,feats,rating,hindi){
    modal.setAttribute('open',''); document.body.classList.add('overflow-hidden');
    var content=modal.querySelector('[id^="QuickAddInfo-"]');
    if(content){
      /* show the card's already-loaded image instantly + a light skeleton for the info */
      content.innerHTML='<div class="qv"><div class="qv-media"><div class="qv-slider">'
        +(instantImg?'<img src="'+instantImg+'" alt="">':'<div class="qv-load"><span class="qv-spin"></span></div>')
        +'</div></div><div class="qv-info"><span class="qv-sk qv-sk-c"></span><span class="qv-sk qv-sk-t"></span><span class="qv-sk qv-sk-p"></span><span class="qv-sk qv-sk-b"></span></div></div>';
    }
    fetchProduct(url).then(function(p){ render(modal,p,instantImg,feats,rating,hindi); })
      .catch(function(){ if(content) content.innerHTML='<div style="padding:40px;text-align:center">Could not load. <a href="'+url+'">Open product &rarr;</a></div>'; });
  }
  document.addEventListener('click',function(e){
    var btn=e.target.closest && e.target.closest(SEL);
    if(!btn) return; var url=btn.getAttribute('data-product-url'); if(!url||url==='#') return;
    /* Always swallow the event first so Dawn's modal-opener (homepage cards) never fires. */
    e.preventDefault(); e.stopPropagation();
    if(isMobile()){ window.location.href=url; return; }
    var op=btn.closest('modal-opener');
    var sel=btn.getAttribute('data-qv-modal')||(op&&op.getAttribute('data-modal'));
    var modal=sel&&document.querySelector(sel);
    var feats=btn.getAttribute('data-aa-features')||'';
    var card=btn.closest('.aa-pcard, .pcard');
    var rateEl=card&&card.querySelector('.aa-pcard__rate');
    var rating=rateEl?(rateEl.textContent||'').replace(/[^0-9.]/g,''):'';
    var hindi=card?(card.getAttribute('data-aa-hindi')||''):'';
    if(modal) openModal(modal,url,trigImg(btn),feats,rating,hindi); else window.location.href=url;
  },true);

  /* click-drag to slide the image slider on desktop (no arrows) */
  var drag=null,dx=0,dscroll=0,moved=false;
  document.addEventListener('pointerdown',function(e){
    var s=e.target.closest&&e.target.closest('.qv-slider'); if(!s) return;
    drag=s; dx=e.clientX; dscroll=s.scrollLeft; moved=false; s.style.scrollSnapType='none';
  });
  document.addEventListener('pointermove',function(e){
    if(!drag) return; var d=e.clientX-dx; if(Math.abs(d)>3) moved=true; drag.scrollLeft=dscroll-d;
  });
  document.addEventListener('pointerup',function(){
    if(!drag) return; var s=drag; drag=null; setTimeout(function(){ s.style.scrollSnapType=''; },60);
  });

  /* Close the quick view ourselves. Dawn's QuickAddModal.hide() calls
     cart-drawer.setActiveElement(), which the theme's custom <cart-drawer>
     doesn't have, so it throws before removing [open] — the X, backdrop and
     Esc all break. Handle them here with a direct close. */
  function closeQV(modal){ if(!modal) return; modal.removeAttribute('open'); document.body.classList.remove('overflow-hidden'); }
  document.addEventListener('click',function(e){
    var modal=document.querySelector('.quick-add-modal[open]'); if(!modal) return;
    if((e.target.closest && e.target.closest('.quick-add-modal__toggle')) || e.target===modal){
      e.preventDefault(); e.stopPropagation(); closeQV(modal);
    }
  },true);
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeQV(document.querySelector('.quick-add-modal[open]')); });
})();
