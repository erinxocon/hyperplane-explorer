uniform sampler2D uLand; uniform float uSpin, uAlpha; uniform vec3 uLight; varying vec3 vDir, vN;
    void main(){
      vec3 v = normalize(vDir);
      float ct = cos(0.41), st = sin(0.41);
      v = vec3(ct * v.x - st * v.y, st * v.x + ct * v.y, v.z);
      float lat = asin(clamp(v.y, -1.0, 1.0)), lon = atan(v.x, -v.z) - uSpin;
      float land = smoothstep(0.35, 0.65, texture2D(uLand, vec2(fract(lon / 6.2831853 + 0.5), lat / 3.1415927 + 0.5)).r);
      float al = abs(lat);
      vec3 ground = mix(vec3(0.33, 0.47, 0.25), vec3(0.62, 0.55, 0.36), smoothstep(0.25, 0.45, al) * (1.0 - smoothstep(0.55, 0.75, al)));
      vec3 sea = mix(vec3(0.07, 0.24, 0.44), vec3(0.11, 0.33, 0.55), smoothstep(0.0, 1.0, 1.0 - al));
      vec3 col = mix(mix(sea, ground, land), vec3(0.90, 0.93, 0.96), smoothstep(1.17, 1.27, al));
      col *= 0.35 + 0.8 * max(dot(normalize(vN), uLight), 0.0);
      gl_FragColor = vec4(col, uAlpha);
    }
