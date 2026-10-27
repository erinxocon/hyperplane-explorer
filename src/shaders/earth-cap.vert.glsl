attribute vec3 aDir; uniform vec3 uCenter; varying vec3 vDir, vN;
    void main(){ vDir = aDir; vN = normalize(position - uCenter); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
