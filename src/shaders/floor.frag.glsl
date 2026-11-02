uniform vec4 uP, uR, uU, uF; uniform vec3 cA, cB, cW, cBg, uFade; varying vec3 vPos;
void main(){
  vec4 X = uP + vPos.x * uR + vPos.y * uU + (-vPos.z) * uF;
  vec3 q = floor(vec3(X.x, X.z, X.w));
  vec3 col = mix(cA, cB, mod(q.x + q.y + q.z, 2.0));
  float grad = length(vec2(uR.w, uF.w));      // tilted into w: mark where the floor crosses integer w
  float wl = abs(fract(X.w + 0.5) - 0.5) / max(grad, 1e-3);
  col = mix(col, cW, smoothstep(0.07, 0.0, wl) * smoothstep(0.02, 0.12, grad) * 0.9);
  float fade = 1.0 - smoothstep(uFade.x, uFade.y, length(vPos.xz - vec2(0.0, uFade.z)));
  gl_FragColor = vec4(mix(cBg, col, fade), 1.0);
  #include <colorspace_fragment>
}
