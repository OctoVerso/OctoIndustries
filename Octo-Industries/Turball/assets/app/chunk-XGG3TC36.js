import{D as c,Ia as h,K as v,O as x,ib as f,p as m,qa as T,s as p}from"./chunk-XNQGNT4K.js";var g=new WeakMap,D=.32,b=.12,C=2.8,V=3.4;function w(i,e,t,r){i.next=e+C+t()*V+r*t()*.65}function H(i,e,t=Math.random){let r=g.get(i);if(!r||r.body!==i.userData.bodyId){let a=[];i.traverse(s=>{s.userData.popupHeadlight&&a.push({node:s,closed:s.rotation.z,angle:s.userData.openAngle||Math.PI*5/18,open:0,start:null,next:e+a.length*.18,from:0,to:1,firstMotion:!0,burstRemaining:0})}),r={body:i.userData.bodyId,hinges:a},g.set(i,r)}if(!r.hinges.length)return!1;let o=!1;return r.hinges.forEach((a,s)=>{if(a.start===null&&e>=a.next&&(a.start=e,a.from=a.open,a.to=1-a.open),a.start===null)return;o=!0;let n=Math.min(1,Math.max(0,(e-a.start)/D)),l=n*n*(3-2*n);a.node.rotation.z=a.closed+a.angle*(a.from+(a.to-a.from)*l),a.node.updateMatrix(),!(n<1)&&(a.open=a.to,a.start=null,a.firstMotion?(a.firstMotion=!1,a.next=e+.2+t()*.35):a.burstRemaining?(a.burstRemaining--,a.burstRemaining?a.next=e+b:w(a,e,t,s)):t()<.18?(a.burstRemaining=3,a.next=e+b):w(a,e,t,s))}),o}function z(i,e){let t=g.get(i);return t?.hinges.length?Math.min(...t.hinges.map(r=>r.start===null?Math.max(0,(r.next-e)*1e3):0)):1/0}var u=4,F=`varying vec2 sampleUV;
void main(){sampleUV=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,U=`varying vec2 sampleUV;
uniform sampler2D source;
uniform vec2 stride;
uniform float cutoff;
uniform float knee;
uniform bool extractHighlights;
void main(){
  vec3 accumulated=vec3(0.0);
  float total=0.0;
  for(int tap=-4;tap<=4;tap++){
    float offset=float(tap);
    float weight=exp(-offset*offset/8.0);
    vec3 radiance=texture2D(source,sampleUV+stride*offset).rgb;
    if(extractHighlights){
      float peak=max(radiance.r,max(radiance.g,radiance.b));
      radiance*=smoothstep(cutoff-knee,cutoff+knee,peak);
    }
    accumulated+=radiance*weight;
    total+=weight;
  }
  gl_FragColor=vec4(accumulated/total,1.0);
}`,E=`varying vec2 sampleUV;
uniform sampler2D fine;
uniform sampler2D medium;
uniform sampler2D wide;
uniform sampler2D widest;
uniform float intensity;
void main(){
  vec3 halo=texture2D(fine,sampleUV).rgb*0.4;
  halo+=texture2D(medium,sampleUV).rgb*0.3;
  halo+=texture2D(wide,sampleUV).rgb*0.2;
  halo+=texture2D(widest,sampleUV).rgb*0.1;
  gl_FragColor=vec4(halo*intensity,1.0);
}`;function d(i,e=!1){let t=new v(1,1,{type:p,minFilter:m,magFilter:m,depthBuffer:e,stencilBuffer:!1});return t.texture.name=i,t.texture.generateMipmaps=!1,t}function S(i,e){return new h({vertexShader:F,fragmentShader:i,uniforms:e,depthTest:!1,depthWrite:!1,toneMapped:!1})}var M=class{constructor(e,t,r,o){this.renderer=e,this.resolutionScale=1,this.strength=.825,this.radius=1,this.sourceTarget=d("TurballBloom.scene",!0),this.downTargets=Array.from({length:u},(a,s)=>d(`TurballBloom.blur${s}`)),this.upTargets=Array.from({length:u},(a,s)=>d(`TurballBloom.scratch${s}`)),this.outputTarget=d("TurballBloom.output"),this.texture=this.outputTarget.texture,this.renderSubmissions=2*u+2,this.blurMaterial=S(U,{source:{value:null},stride:{value:new c},cutoff:{value:1.2},knee:{value:.15},extractHighlights:{value:!1}}),this.combineMaterial=S(E,{fine:{value:this.downTargets[0].texture},medium:{value:this.downTargets[1].texture},wide:{value:this.downTargets[2].texture},widest:{value:this.downTargets[3].texture},intensity:{value:this.strength}}),this.quad=new f(this.blurMaterial),this.setSize(t,r,o)}configure(e){this.strength=e.bloomEnabled?e.bloomStrength:0,this.radius=e.bloomRadius,this.blurMaterial.uniforms.cutoff.value=e.bloomThreshold}setSize(e,t,r=this.renderer.getPixelRatio()){let o=Math.max(1,Math.round(e*r*.375*this.resolutionScale)),a=Math.max(1,Math.round(t*r*.375*this.resolutionScale));this.sourceTarget.setSize(o,a);for(let s=0;s<u;s++)o=Math.max(1,Math.round(o/2)),a=Math.max(1,Math.round(a/2)),this.downTargets[s].setSize(o,a),this.upTargets[s].setSize(o,a);this.outputTarget.setSize(this.downTargets[0].width,this.downTargets[0].height)}withRendererState(e){let t=this.renderer,r={target:t.getRenderTarget(),autoClear:t.autoClear,color:t.getClearColor(new x),alpha:t.getClearAlpha()};try{return t.autoClear=!1,e()}finally{t.setRenderTarget(r.target),t.setClearColor(r.color,r.alpha),t.autoClear=r.autoClear}}clear(){this.withRendererState(()=>{this.renderer.setRenderTarget(this.outputTarget),this.renderer.setClearColor(0,0),this.renderer.clear(!0,!1,!1)})}renderTexture(e){this.render(null,null,e)}render(e,t,r=null){this.withRendererState(()=>{let o=this.renderer;r||(o.setRenderTarget(this.sourceTarget),o.setClearColor(0,0),o.clear(!0,!0,!0),o.render(e,t));let a=r||this.sourceTarget;this.quad.material=this.blurMaterial;let s=this.blurMaterial.uniforms,n=Math.max(.25,this.radius??1);for(let l=0;l<u;l++)s.source.value=a.texture,s.stride.value.set(n/a.width,0),s.extractHighlights.value=l===0,o.setRenderTarget(this.upTargets[l]),this.quad.render(o),s.source.value=this.upTargets[l].texture,s.stride.value.set(0,n/this.upTargets[l].height),s.extractHighlights.value=!1,o.setRenderTarget(this.downTargets[l]),this.quad.render(o),a=this.downTargets[l];this.combineMaterial.uniforms.intensity.value=this.strength,this.quad.material=this.combineMaterial,o.setRenderTarget(this.outputTarget),this.quad.render(o)})}dispose(){for(let e of[this.sourceTarget,...this.downTargets,...this.upTargets,this.outputTarget])e.dispose();this.blurMaterial.dispose(),this.combineMaterial.dispose(),this.quad.dispose()}};var q=`
uniform float lookEnabled,lookContrast,lookSaturation,lookVibrance,lookTemperature,lookTint,lookHue,lookGamma,lookLift,lookGain;
uniform float lookShadows,lookMidtones,lookHighlights,lookVignette,lookVignetteSoftness;
uniform vec3 lookFilter,lookShadowTint,lookHighlightTint;
vec3 gradeColor(vec3 color,vec2 uv){
  if(lookEnabled<.5)return color;
  color=max(vec3(0.),color*lookFilter*vec3(1.+lookTemperature*.0015,1.-lookTint*.001,1.-lookTemperature*.0015));
  float luma=dot(color,vec3(.2126,.7152,.0722));float level=luma/(1.+luma);
  float shadow=1.-smoothstep(.08,.45,level),highlight=smoothstep(.35,.8,level),mid=max(0.,1.-shadow-highlight);
  color*=exp2(lookShadows*shadow+lookMidtones*mid+lookHighlights*highlight);
  color*=mix(vec3(1.),lookShadowTint,shadow)*mix(vec3(1.),lookHighlightTint,highlight);
  color=max(vec3(0.),color+lookLift)*lookGain;
  color=pow(max(vec3(.00001),color/.18),vec3(lookContrast))*.18;
  color=pow(color,vec3(1./lookGamma));
  luma=dot(color,vec3(.2126,.7152,.0722));
  float chroma=(max(max(color.r,color.g),color.b)-min(min(color.r,color.g),color.b))/max(.001,max(max(color.r,color.g),color.b));
  color=mix(vec3(luma),color,lookSaturation+lookVibrance*(1.-chroma));
  vec3 axis=normalize(vec3(1.));float angle=lookHue*.01745329252;
  color=color*cos(angle)+cross(axis,color)*sin(angle)+axis*dot(axis,color)*(1.-cos(angle));
  float edge=length((uv-.5)*1.41421356);
  color*=1.-lookVignette*smoothstep(1.-lookVignetteSoftness,1.,edge);
  return max(vec3(0.),color);
}`,R={enabled:"Enabled",contrast:"Contrast",saturation:"Saturation",vibrance:"Vibrance",temperature:"Temperature",tint:"Tint",hue:"Hue",gamma:"Gamma",lift:"Lift",gain:"Gain",shadows:"Shadows",midtones:"Midtones",highlights:"Highlights",vignette:"Vignette",vignetteSoftness:"VignetteSoftness"},y={colorFilter:"Filter",shadowTint:"ShadowTint",highlightTint:"HighlightTint"};function I(){return{...Object.fromEntries(Object.values(R).map(i=>["look"+i,{value:0}])),...Object.fromEntries(Object.values(y).map(i=>["look"+i,{value:[1,1,1]}]))}}function G(i,e){for(let[t,r]of Object.entries(R))i["look"+r].value=t==="enabled"?Number(e[t]):e[t];for(let[t,r]of Object.entries(y)){let o=Number.parseInt(e[t].slice(1),16);i["look"+r].value=[(o>>16&255)/255,(o>>8&255)/255,(o&255)/255]}}function _(i,e,t,{scale:r=1,baseExposure:o=1.15,hemisphere:a,sun:s,rim:n,sky:l}={}){i.toneMapping=t.enabled?t.toneMapping:4,i.toneMappingExposure=o*Math.pow(2,t.enabled?t.exposure:0),e.environmentIntensity=t.environment,e.fog&&(e.fog.color.set(t.fogColor),e.fog.near=t.fogStart*r,e.fog.far=t.fogEnd*r),a&&(a.intensity=(r===1?1.15:2.5)*t.ambient),s&&(s.intensity=(r===1?1:3.3)*t.sun,s.color.set(t.sunColor)),n&&(n.intensity=(r===1?.35:1.8)*t.ambient),l?.material?.uniforms&&(l.material.uniforms.skyExposure.value=t.skyExposure,l.material.uniforms.skyRotation.value=t.skyRotation*Math.PI/180),l?.userData?.setSkybox?.(t.skybox)}var k=class{constructor(e,{scale:t=1}={}){this.camera=e,this.scale=t,this.enabled=!1,this.needsSwap=!0,this.material=new h({depthTest:!1,depthWrite:!1,toneMapped:!1,uniforms:{colorTexture:{value:null},depthTexture:{value:null},texelSize:{value:new c},cameraNear:{value:1},cameraFar:{value:1e4},focusDistance:{value:1100},focusRange:{value:600},blurRadius:{value:8}},vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:`
        varying vec2 vUv;
        uniform sampler2D colorTexture,depthTexture;
        uniform vec2 texelSize;
        uniform float cameraNear,cameraFar,focusDistance,focusRange,blurRadius;
        float distanceAt(vec2 uv){
          float depth=texture2D(depthTexture,uv).x;
          return cameraNear*cameraFar/max(cameraFar-depth*(cameraFar-cameraNear),0.00001);
        }
        void main(){
          float depth=distanceAt(vUv);
          float blur=clamp((abs(depth-focusDistance)-focusRange)/focusRange,0.,1.)*blurRadius;
          vec4 color=texture2D(colorTexture,vUv);
          if(blur<0.25){gl_FragColor=color;return;}
          float total=1.;
          for(int i=0;i<20;i++){
            float index=float(i)+0.5;
            float angle=index*2.39996323;
            vec2 offset=vec2(cos(angle),sin(angle))*sqrt(index/20.)*blur*texelSize;
            vec2 sampleUv=clamp(vUv+offset,texelSize*.5,1.-texelSize*.5);

            float sampleDepth=distanceAt(sampleUv);
            float weight=1.-smoothstep(focusRange*.25,focusRange,max(0.,sampleDepth-depth));
            color+=texture2D(colorTexture,sampleUv)*weight;total+=weight;
          }
          gl_FragColor=color/total;
        }`}),this.quad=new f(this.material)}configure(e){this.enabled=e.dofEnabled&&e.dofBlur>0;let t=this.material.uniforms;t.focusDistance.value=e.dofFocus*this.scale,t.focusRange.value=Math.max(.001,e.dofRange*this.scale),t.blurRadius.value=e.dofBlur}attachDepth(e,t=T){!this.enabled||e.depthTexture||(e.depthTexture=new t(e.width,e.height),e.dispose())}setSize(){}render(e,t,r){let o=this.material.uniforms;o.colorTexture.value=r.texture,o.depthTexture.value=r.depthTexture,o.texelSize.value.set(1/r.width,1/r.height),o.cameraNear.value=this.camera.near,o.cameraFar.value=this.camera.far,e.setRenderTarget(this.renderToScreen?null:t),this.quad.render(e)}dispose(){this.material.dispose(),this.quad.dispose()}};export{H as a,z as b,M as c,k as d,q as e,I as f,G as g,_ as h};
