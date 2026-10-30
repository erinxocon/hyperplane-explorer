uniform sampler2D uLand; uniform float uSpin, uAlpha; uniform vec3 uLight; varying vec3 vDir, vN;
    void main(){
      vec3 col = earthSurface(uLand, normalize(vDir), uSpin);
      col *= 0.35 + 0.8 * max(dot(normalize(vN), uLight), 0.0);
      gl_FragColor = vec4(col, uAlpha);
    }
