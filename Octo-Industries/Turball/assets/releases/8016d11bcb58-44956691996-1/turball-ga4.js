(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.TurballAnalytics=api;if(root.document)api.install(root,root.document);}
})(typeof window!=='undefined'?window:globalThis,function(){
  const measurementId='G-X14086LH89';
  const token=value=>/^[a-z][a-z0-9_-]{0,39}$/.test(value||'')?value:'unknown';
  function install(win,doc,context={}){
    if(win.__turballGA){win.__turballGA.context(context);return win.__turballGA;}
    const query=new URLSearchParams(win.location.search),portal=['pg','cg','yeight'].find(key=>query.getAll(key).includes('true'));
    const trusted=win.location.hostname==='turball.io'||portal==='cg'&&/(^|\.)crazygames\.com$/.test(win.location.hostname)||portal==='yeight'&&/(^|\.)y8\.com$/.test(win.location.hostname);
    if(!trusted||(!portal&&win.top!==win.self)||query.getAll('debug').includes('true')||win.navigator.doNotTrack==='1'||win.navigator.globalPrivacyControl===true||doc.getElementById('turball-ga4'))return false;
    win.dataLayer=win.dataLayer||[];
    const gtag=win.gtag||function(){if(win.TurballGaLoaded||win.dataLayer.length<256)win.dataLayer.push(arguments);};win.gtag=gtag;
    let route='home',metadata=()=>({canonical:'https://turball.io/',title:'Turball'}),routeListener=false,configured=false,pageViewed=!!context.routeMetadata;
    const release=String(doc.querySelector?.('meta[name="game-version"]')?.content||'local').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,100);
    let referrer='';try{referrer=new URL(doc.referrer).origin+'/';}catch{}
    const fallbackFailures=new Set();
    const api={context(next){
      if(!next.routeMetadata)return;
      metadata=next.routeMetadata;route=next.routeFromPath(win.location.pathname)||'home';
      if(configured&&!pageViewed){pageViewed=true;const page=metadata(route);gtag('config',measurementId,{page_location:page.canonical,page_title:page.title,page_referrer:referrer,send_page_view:true});}
      if(routeListener)return;routeListener=true;
      win.addEventListener('turball:routechange',event=>{
        const value=event?.detail?.route;
        const nextRoute=next.routes.includes(value)?value:next.routeFromPath(win.location.pathname);
        if(!nextRoute||nextRoute===route)return;route=nextRoute;
        const page=metadata(route);
        gtag('event','screen_view',{send_to:measurementId,app_name:'Turball',screen_name:route,page_location:page.canonical,page_title:page.title,page_referrer:referrer});
      });
    },send(name,values={}){
      if(!['game_error','game_load','game_health','game_session_end','game_recovery','game_playtime','creative_launch'].includes(name))return false;
      const params={send_to:measurementId,game_portal:portal||'standalone',game_release:release,screen_name:route,page_location:metadata(route).canonical,transport_type:'beacon'};
      for(const key of ['error_category','error_code','loading_stage','operation','device_class','os_family','browser_family','webgl_version','outcome','game_mode','game_queue'])if(values[key]!==undefined)params[key]=token(values[key]);
      for(const key of ['http_status','occurrences','elapsed_ms','lobby_ms','play_load_ms','browser_fps','long_frames','context_losses','sample_ms','active_play_ms'])if(Number.isFinite(values[key]))params[key]=Math.max(0,Math.min(86400000,Math.round(values[key])));
      if(typeof values.fatal==='boolean')params.fatal=values.fatal;
      if(!win.TurballGaLoaded&&win.dataLayer.length>=256)return false;
      try{gtag('event',name,params);return true;}catch{return false;}
    }};
    api.context(context);win.__turballGA=api;
    gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    gtag('set','ads_data_redaction',true);gtag('set','url_passthrough',false);gtag('js',new Date());
    const page=metadata(route);
    gtag('config',measurementId,{page_location:page.canonical,page_title:page.title,page_referrer:referrer,allow_google_signals:false,allow_ad_personalization_signals:false,send_page_view:pageViewed});configured=true;
    win.addEventListener('turball:failure',event=>{
      if(event.detail?.reported)return;
      const category=token(event.detail?.category),stage=token(event.detail?.stage),key=category+':'+stage;
      if(fallbackFailures.has(key)||fallbackFailures.size>=128)return;fallbackFailures.add(key);
      api.send('game_error',{error_category:category,error_code:token(event.detail?.code),loading_stage:stage,fatal:event.detail?.fatal===true,occurrences:1});
    });
    return api;
  }
  return {install,measurementId};
});
