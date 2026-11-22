function o(e){return{uniforms:{driving:{value:e?1:0},visualScale:{value:1}},vertexShader:`
uniform float visualScale;
attribute vec3 aOffset;
attribute vec2 aSize;
attribute float aOpacity, aLife, aRotation;
varying vec2 puffUV;
varying vec3 puffState;
void main(){
  float ember=step(0.55,fract(aRotation*2.7));
  vec2 extent=position.xy*aSize*visualScale*(1.0-0.45*ember);
  mat2 spin=mat2(cos(aRotation),sin(aRotation),-sin(aRotation),cos(aRotation));
  vec4 centre=modelViewMatrix*vec4(aOffset,1.0);
  centre.xy+=spin*extent;
  gl_Position=projectionMatrix*centre;
  puffUV=uv*2.0-1.0;
  puffState=vec3(aOpacity,aLife,ember);
}`,fragmentShader:`
uniform float driving;
varying vec2 puffUV;
varying vec3 puffState;
void main(){
  vec2 q=puffUV;
  float radius=0.70+0.09*cos(atan(q.y,q.x)*5.0);
  float outline=mix(length(q)-radius,abs(q.x)+abs(q.y)-0.72,puffState.z);
  float feather=max(fwidth(outline),0.008);
  float coverage=1.0-smoothstep(-feather,feather,outline);
  float opacity=coverage*puffState.x;
  if(opacity<0.003)discard;
  float interior=1.0-smoothstep(-0.20,-0.10,outline);
  float hot=(1.0-smoothstep(0.10,0.75,puffState.y))*max(0.0,1.0-length(q+vec2(0.06,0.14))*1.8);
  vec3 rim=mix(vec3(0.88,0.18,0.015),vec3(0.25,0.33,0.41),driving);
  vec3 body=mix(vec3(1.0,0.46,0.065),vec3(0.53,0.63,0.71),driving);
  vec3 core=mix(vec3(1.25,0.72,0.23),vec3(0.76,0.83,0.86),driving);
  gl_FragColor=vec4(mix(mix(rim,body,interior),core,hot),opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`}}function a(){return{uniforms:{time:{value:0},opacity:{value:0}},vertexShader:`
uniform float time;
varying vec2 flameUV;
varying vec3 flameNormal, flameView;
void main(){
  flameUV=uv;
  float distanceFromNozzle=1.0-uv.y;
  float bend=distanceFromNozzle*distanceFromNozzle;
  vec3 displaced=position;
  displaced.x*=1.0+0.055*sin(time*23.0+distanceFromNozzle*3.0);
  displaced.yz+=bend*vec2(1.8*sin(time*18.0-distanceFromNozzle*6.0),1.2*cos(time*16.0-distanceFromNozzle*7.0));
  vec4 eye=modelViewMatrix*vec4(displaced,1.0);
  flameNormal=normalMatrix*normal;
  flameView=-eye.xyz;
  gl_Position=projectionMatrix*eye;
}`,fragmentShader:`
uniform float opacity;
varying vec2 flameUV;
varying vec3 flameNormal, flameView;
void main(){
  float face=abs(dot(normalize(flameNormal),normalize(flameView)));
  float rimToBody=smoothstep(0.26,0.42,face);
  float hotCentre=smoothstep(0.78,0.91,face)*smoothstep(0.24,0.38,flameUV.y);
  vec3 shell=mix(vec3(0.95,0.16,0.012),vec3(1.2,0.46,0.055),rimToBody);
  gl_FragColor=vec4(mix(shell,vec3(1.3,1.0,0.45),hotCentre),opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`}}function t(){return{uniforms:{intensity:{value:0},visualScale:{value:1}},vertexShader:`
uniform float visualScale;
void main(){
  vec4 eye=modelViewMatrix*vec4(position,1.0);
  gl_PointSize=visualScale*7500.0/max(1.0,-eye.z);
  gl_Position=projectionMatrix*eye;
}`,fragmentShader:`
uniform float intensity;
void main(){
  vec2 q=abs(2.0*gl_PointCoord-1.0);
  float arm=max(q.x,q.y);
  float crossWidth=min(q.x,q.y);
  float signedEdge=crossWidth+0.32*arm-0.29;
  float aa=max(fwidth(signedEdge),0.008);
  float alpha=(1.0-smoothstep(-aa,aa,signedEdge))*(1.0-arm)*intensity;
  if(alpha<0.003)discard;
  gl_FragColor=vec4(1.9,1.48,0.82,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`}}var i={vertexShader:`
attribute float aAcross, aLifeAlpha;
varying vec2 ribbonCoord;
void main(){
  ribbonCoord=vec2(aAcross,aLifeAlpha);
  vec4 viewPoint=modelViewMatrix*vec4(position,1.0);
  gl_Position=projectionMatrix*viewPoint;
}`,fragmentShader:`
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 ribbonCoord;
void main(){
  float across=abs(ribbonCoord.x);
  float centre=clamp((0.40-across)/0.36,0.0,1.0);
  centre=centre*centre*(3.0-2.0*centre);
  float rails=clamp((0.085-abs(across-0.78))/0.06,0.0,1.0);
  rails*=rails*(3.0-2.0*rails);
  float life=clamp(ribbonCoord.y,0.0,1.0);
  float opacity=uOpacity*life*(centre+0.48*life*rails);
  if(opacity<0.003)discard;
  gl_FragColor=vec4(uColor+(vec3(0.88,0.96,1.0)-uColor)*(0.45*centre),opacity);
}`},r={vertexShader:`
attribute vec4 seed;
uniform float time, strength, aspect;
uniform vec3 travel;
uniform mat4 cameraProjection;
varying vec2 strokeCoord,screenPoint;
varying float strokeAlpha;
void main(){
  vec3 axis=abs(travel.y)<0.95?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0);
  vec3 horizontal=normalize(cross(travel,axis));
  vec3 vertical=cross(horizontal,travel);
  float phase=fract(seed.z+time*(0.7714+0.2926*seed.w));
  float angle=6.2831853*seed.x;
  vec3 radial=(cos(angle)*horizontal+sin(angle)*vertical)*(240.0+1310.0*sqrt(seed.y));
  vec3 front=radial+travel*(2400.0-4800.0*phase)+vec3(0.0,0.0,480.0);
  vec3 rear=front+travel*(240.0+200.0*seed.w);
  float visibility=1.0-step(-30.0,min(front.z,rear.z));
  float dz=rear.z-front.z;
  float denominator=abs(dz)>0.0001?dz:0.0001;
  float crossing=clamp((-30.0-front.z)/denominator,0.0,1.0);
  vec3 clipped=mix(front,rear,crossing);
  if(front.z>-30.0)front=clipped;
  if(rear.z>-30.0)rear=clipped;
  vec4 projectedFront=cameraProjection*vec4(front,1.0);
  vec4 projectedRear=cameraProjection*vec4(rear,1.0);
  vec2 start=projectedFront.xy/max(projectedFront.w,0.01);
  vec2 end=projectedRear.xy/max(projectedRear.w,0.01);
  vec2 direction=(end-start)*vec2(aspect,1.0);
  vec2 perpendicular=vec2(-direction.y,direction.x)/max(length(direction),0.0001);
  vec2 point=start+(end-start)*position.x+perpendicular/vec2(aspect,1.0)*position.y*(0.0018+0.001*seed.w);
  gl_Position=visibility>0.5?vec4(point,0.0,1.0):vec4(2.0,2.0,2.0,1.0);
  screenPoint=point;
  strokeCoord=position.xy;
  strokeAlpha=visibility*strength*(0.375+0.225*seed.w)*smoothstep(0.0,0.08,phase)*(1.0-smoothstep(0.88,1.0,phase));
}`,fragmentShader:`
uniform float aspect;
varying vec2 strokeCoord,screenPoint;
varying float strokeAlpha;
void main(){
  float edge=clamp((1.0-abs(strokeCoord.y))/0.85,0.0,1.0);
  edge*=edge*(3.0-2.0*edge);
  float nose=smoothstep(0.0,0.08,strokeCoord.x);
  float taper=1.0-smoothstep(0.35,1.0,strokeCoord.x);
  float periphery=smoothstep(0.24,0.68,length(screenPoint*vec2(aspect,1.0)));
  gl_FragColor=vec4(0.88,0.96,1.0,strokeAlpha*edge*nose*taper*periphery);
}`};export{o as a,a as b,t as c,i as d,r as e};
