(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.GameDeviceDiagnostics=factory;
})(typeof window!=='undefined'?window:globalThis,function(host,options){
  'use strict';
  const lightweight=options?.lightweight===true;
  const nav=host.navigator||{},ua=nav.userAgent||'',clean=v=>String(v||'unknown').replace(/[\x00-\x1f<>]/g,'').slice(0,160);
  const ios=/iPhone|iPad|iPod/.test(ua)||/Macintosh/.test(ua)&&nav.maxTouchPoints>1;
  const os=ios?'iOS':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'macOS':/CrOS/.test(ua)?'ChromeOS':/Linux/.test(ua)?'Linux':'unknown';
  const match=ua.match(/(EdgA?|EdgiOS|OPR)\/([\d.]+)/)||ua.match(/(Firefox|FxiOS|CriOS|Chrome|Version)\/([\d.]+)/);
  const android=ua.match(/Android[^;]*;\s*(?:[a-z]{2}[-_][A-Z]{2};\s*)?([^;)]+?)(?: Build\/[^;)]+)?\)/);
  const profile={deviceClass:/iPad/.test(ua)||ios&&/Macintosh/.test(ua)||/Android/.test(ua)&&!/Mobile/.test(ua)?'tablet':ios||/Android|Mobile/.test(ua)||nav.userAgentData?.mobile?'phone':'desktop',
    os,osVersion:clean((ios&&/Macintosh/.test(ua)?[]:ua.match(/(?:Android |CPU (?:iPhone )?OS |Mac OS X |Windows NT )([\d._]+)/)||[])[1]).replace(/_/g,'.'),
    browser:match?({Version:'Safari',CriOS:'Chrome',FxiOS:'Firefox',Edg:'Edge',EdgA:'Edge',EdgiOS:'Edge',OPR:'Opera'}[match[1]]||match[1]):'unknown',
    browserVersion:clean(match?.[2]),model:clean(ios?(/iPad/.test(ua)||/Macintosh/.test(ua)?'iPad (family)':'iPhone/iPod (family)'):android?.[1]),
    gpu:'unknown',webgl:lightweight?'unknown':'unavailable',wasm:typeof host.WebAssembly==='object',cpuThreads:Math.min(256,Math.max(0,Number(nav.hardwareConcurrency)||0)),
    memoryGB:Math.min(1024,Math.max(0,Number(nav.deviceMemory)||0)),screenWidth:Math.min(32768,host.screen?.width||0),screenHeight:Math.min(32768,host.screen?.height||0),pixelRatio:Math.min(16,host.devicePixelRatio||1)};

  if(lightweight)profile.webgl='unknown';
  if(!lightweight)try{const canvas=host.document.createElement('canvas');let gl=canvas.getContext('webgl2');if(gl)profile.webgl='2';else{gl=canvas.getContext('webgl');if(gl)profile.webgl='1';}
    if(gl){const ext=gl.getExtension('WEBGL_debug_renderer_info');profile.gpu=clean(gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER));gl.getExtension('WEBGL_lose_context')?.loseContext();}}catch{}
  if(!lightweight)try{nav.userAgentData?.getHighEntropyValues?.(['model','platformVersion','fullVersionList']).then(h=>{
    if(h.model)profile.model=clean(h.model);if(h.platformVersion)profile.osVersion=clean(h.platformVersion);
    const brands=h.fullVersionList||[];const b=brands.find(b=>/Microsoft Edge|Opera/.test(b.brand))||brands.find(b=>/Google Chrome/.test(b.brand))||brands.find(b=>b.brand==='Chromium');
    if(b){profile.browser=clean(b.brand);profile.browserVersion=clean(b.version);}
  }).catch(()=>{});}catch{}
  const pacing={frames:0,elapsedMs:0,longFrames:0,worstFrameMs:0};
  let activeUntil=0,last=0,contextLosses=0,queued=false;
  const now=()=>host.performance.now();
  function schedule(){if(!queued&&pacing.elapsedMs<60000&&host.document.visibilityState!=='hidden'&&host.requestAnimationFrame){queued=true;host.requestAnimationFrame(loop);}}
  function loop(stamp){
    queued=false;
    if(stamp<=activeUntil&&host.document.visibilityState!=='hidden'&&pacing.elapsedMs<60000){
      if(last){const delta=Math.max(0,stamp-last);pacing.frames++;pacing.elapsedMs=Math.min(60000,pacing.elapsedMs+delta);if(delta>100)pacing.longFrames++;pacing.worstFrameMs=Math.max(pacing.worstFrameMs,Math.min(86400000,delta));}
      last=stamp;schedule();
    }else last=0;
  }
  host.document?.addEventListener('visibilitychange',()=>{last=0;if(activeUntil>=now())schedule();});
  host.document?.addEventListener('webglcontextlost',e=>{if(e.target?.id==='arena-canvas'||e.target?.id==='unity-canvas')contextLosses=Math.min(10000,contextLosses+1);},true);
  return {graphics(version){if(['1','2'].includes(version))profile.webgl=version;},playing(value){if(pacing.elapsedMs>=60000)return;activeUntil=value?now()+2500:0;if(value)schedule();else last=0;},snapshot(){return {version:1,profile:{...profile},pacing:{...pacing,elapsedMs:Math.round(pacing.elapsedMs),worstFrameMs:Math.round(pacing.worstFrameMs)},contextLosses};}};
});
