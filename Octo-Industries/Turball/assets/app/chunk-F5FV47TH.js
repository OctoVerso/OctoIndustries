import{b as s}from"./chunk-NQX5GNRJ.js";var r=new WeakSet,h=`
varying vec3 vFinishPosition;
uniform float paintFinishPattern;
float finishHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float finishVisibility(vec2 p) {
  vec2 width = fwidth(p);
  return 1.0 - smoothstep(0.35, 1.25, max(width.x, width.y));
}
`,c=`
if (paintFinishPattern > 0.5) {
  vec2 finishUV = vFinishPosition.xz + vFinishPosition.y * vec2(0.51, 0.73);
  if (paintFinishPattern < 1.5) {
    float pearlEdge = 1.0 - abs(dot(normal, normalize(vViewPosition)));
    vec3 pearlTint = mix(vec3(1.14, 1.02, 0.91), vec3(0.81, 1.08, 1.28), pearlEdge);
    diffuseColor.rgb *= pearlTint;
    diffuseColor.rgb += vec3(0.025, 0.018, 0.035) * pearlEdge * pearlEdge;
  } else if (paintFinishPattern < 2.5) {
    vec2 grainGrid = finishUV * 170.0;
    float grain = (finishHash(floor(grainGrid)) - 0.5) * finishVisibility(grainGrid);
    diffuseColor.rgb *= 0.94 + grain * 0.12;
    roughnessFactor += grain * 0.10;
  } else if (paintFinishPattern < 3.5) {
    vec2 brushGrid = finishUV * vec2(9.0, 125.0);
    float brush = sin(brushGrid.y * 6.283185 + sin(brushGrid.x) * 0.8);
    brush *= finishVisibility(brushGrid);
    diffuseColor.rgb *= 0.94 + brush * 0.06;
    roughnessFactor += brush * 0.10;
  } else if (paintFinishPattern < 4.5) {
    vec2 weaveGrid = finishUV * 55.0;
    vec2 cell = floor(weaveGrid);
    float direction = step(2.0, mod(cell.x + cell.y, 4.0));
    float thread = mix(fract(weaveGrid.x), fract(weaveGrid.y), direction);
    float weave = sin(thread * 3.141593);
    float visible = finishVisibility(weaveGrid);
    diffuseColor.rgb *= mix(0.80, 0.60 + weave * 0.34, visible);
    roughnessFactor += (0.08 - weave * 0.13) * visible;
  } else if (paintFinishPattern < 5.5) {
    vec2 flakeGrid = finishUV * 110.0;
    vec2 flakeCell = fract(flakeGrid) - 0.5;
    float flake = step(0.73, finishHash(floor(flakeGrid)));
    flake *= 1.0 - smoothstep(0.03, 0.20, dot(flakeCell, flakeCell));
    flake *= finishVisibility(flakeGrid);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), flake * 0.23);
    roughnessFactor = mix(roughnessFactor, 0.065, flake);
  } else {
    vec2 chipGrid = finishUV * 21.0;
    vec2 chip = fract(chipGrid);
    float triangle = step(chip.y, chip.x);
    float grain = finishHash(floor(chipGrid) + vec2(triangle * 17.0, 0.0));
    float visible = finishVisibility(chipGrid);
    diffuseColor.rgb *= mix(0.65, 0.39 + grain * 0.50, visible);
    roughnessFactor += (grain - 0.5) * 0.24 * visible;
  }
}
`;function d(i,t="GLOSSY"){let n=s(t);if(i.roughness=n.roughness,i.metalness=n.metalness,i.userData.stainlessSteel&&n.id==="GLOSSY"&&(i.roughness=.16,i.metalness=.95),i.userData.paintFinish=n.id,!r.has(i)){r.add(i);let a=i.userData.paintFinishUniforms={paintFinishPattern:{value:n.pattern}},o=i.onBeforeCompile,f=i.customProgramCacheKey();i.onBeforeCompile=(e,l)=>{o.call(i,e,l),Object.assign(e.uniforms,a),e.vertexShader=`varying vec3 vFinishPosition;
`+e.vertexShader,e.vertexShader=e.vertexShader.replace("#include <begin_vertex>",`#include <begin_vertex>
vFinishPosition = position;`),e.fragmentShader=h+e.fragmentShader,e.fragmentShader=e.fragmentShader.replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
`+c)},i.customProgramCacheKey=()=>`${f}|turball-paint-finish-v1`,i.needsUpdate=!0}return i.userData.paintFinishUniforms.paintFinishPattern.value=n.pattern,i}export{d as a};
