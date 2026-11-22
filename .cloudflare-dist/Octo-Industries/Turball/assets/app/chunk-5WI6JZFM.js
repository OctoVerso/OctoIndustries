function c(o,{zenith:i,horizon:a,sun:t=16772558,cloud:n=16774372}){o.setPaintSky?.(i,a,t);let e=o.THREE,s=new e.ShaderMaterial({side:e.BackSide,depthWrite:!1,uniforms:{zenith:{value:new e.Color(i)},horizon:{value:new e.Color(a)},sun:{value:new e.Color(t)},cloud:{value:new e.Color(n)}},vertexShader:"varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:`varying vec3 direction;uniform vec3 zenith,horizon,sun,cloud;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec3 d=normalize(direction);float y=max(0.,d.y);
        vec3 color=mix(horizon,zenith,smoothstep(0.,.82,y));float shine=max(dot(d,normalize(vec3(.37,.26,.89))),0.);
        color=mix(color,sun,.34*pow(shine,20.)+.63*smoothstep(.9990,.9996,shine));
        vec2 p=d.xz/(.14+y)*vec2(3.,6.)+vec2(12.,5.);
        float vapor=noise2(p)*.58+noise2(p*2.1)*.28+noise2(p*4.2)*.14;
        color=mix(color,cloud,smoothstep(.55,.77,vapor)*smoothstep(.015,.18,y)*.64);
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`}),r=new e.Mesh(new e.SphereGeometry(1,32,16),s);return r.scale.setScalar(o.camera.far*.81),r.renderOrder=-20,r.frustumCulled=!1,o.scene.add(r),()=>r.position.copy(o.camera.position)}function l(o,i,a=.04){let t=o.THREE,n=new t.ShaderMaterial({transparent:!0,depthWrite:!1,vertexShader:"varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:"varying vec2 st;void main(){vec2 q=abs(st*2.-1.);float d=pow(q.x,3.)+pow(q.y,3.);gl_FragColor=vec4(.025,.045,.06,.47*(1.-smoothstep(.24,1.,d)));}"}),e=new t.Mesh(new t.PlaneGeometry(3.3,5.3),n);return e.rotation.x=-Math.PI/2,o.scene.add(e),()=>{e.position.set(i.position.x,a,i.position.z),e.rotation.z=i.rotation.y}}export{c as a,l as b};
