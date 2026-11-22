import"./chunk-IJL2WJNH.js";function A(b,l){let{THREE:a,scene:F}=b,v=new Float32Array(3200*6),h=new Float32Array(3200*6),y=42971,r=()=>(y=Math.imul(y,1664525)+1013904223>>>0)/4294967296;for(let t=0;t<3200;t++){let p=[r()*36,r()*22,r()*36],m=r(),s=.8+r()*.4;for(let o=0;o<2;o++){let i=(t*2+o)*3;v.set(p,i),h.set([o,m,s],i)}}let d=new a.BufferGeometry;d.setAttribute("position",new a.BufferAttribute(v,3)),d.setAttribute("drop",new a.BufferAttribute(h,3));let n={seconds:{value:0},amount:{value:0}},g=new a.ShaderMaterial({transparent:!0,depthWrite:!1,uniforms:n,vertexShader:`
      attribute vec3 drop;uniform float seconds,amount;varying float alpha;
      void main(){
        float h=mod(position.y-seconds*17.*drop.z-cameraPosition.y,22.);
        vec2 drift=vec2(1.2,.6);
        vec2 lateral=mod(position.xz-cameraPosition.xz+drift*(22.-h)*.08,36.)-18.;
        vec3 at=cameraPosition+vec3(lateral.x,h-7.7,lateral.y);
        at+=vec3(-drift.x*.08,1.,-drift.y*.08)*drop.x*.4;
        float fade=(1.-smoothstep(10.8,18.,length(lateral)))*smoothstep(1.2,3.5,distance(at,cameraPosition));
        alpha=amount*fade*step(drop.y,amount*.65)*(.12+.16*drop.x)*.78;
        gl_Position=projectionMatrix*viewMatrix*vec4(at,1.);
      }`,fragmentShader:"varying float alpha;void main(){gl_FragColor=vec4(.72,.76,.82,alpha);}"}),e=new a.LineSegments(d,g);e.name="Harbor shower",e.frustumCulled=!1,e.renderOrder=20,e.visible=!1,F.add(e);let u=new l.R.Ray({x:0,y:0,z:0},{x:0,y:0,z:1}),z=[[0,0],[4,0],[-4,0],[0,4],[0,-4]],c=1,f=0,x=!1,w=0;return{update(t,p,m){if(m<=0)return e.visible=!1,f=0,c=1,0;if(f-=t,w+=t,f<=0){f=.25;let s=p.position,o=l.R.QueryFilterFlags.ONLY_FIXED|l.R.QueryFilterFlags.EXCLUDE_SENSORS;u.origin.z=s.y;let i=0;for(let[S,R]of z)u.origin.x=-s.x-S,u.origin.y=s.z+R,l.world.castRay(u,22,!0,o)&&i++;x=i>=3}return c=Math.min(1,Math.max(0,c+(x?-1:1)*t*2)),n.seconds.value=w%2048,n.amount.value=c*m,e.visible=n.amount.value>.02,n.amount.value},dispose(){e.removeFromParent(),d.dispose(),g.dispose()}}}export{A as streetShower};
