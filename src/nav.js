// The markup every 4D page's stage (stage.js) shares: the overlay in the view (position readout, compass, hint, Stack
// labels), the View / Move / Rotate sections and the frame matrix. A page puts <div id="nav"></div> and
// <div id="nav-frame"></div> in its panel where they go, and its own sections around them.
export const VIEW_OVERLAY = `
    <div class="hud top" id="hud">
      <span>x <b id="px">0.00</b></span><span>y <b id="py">0.00</b></span><span>z <b id="pz">0.00</b></span><span class="w">w <b id="pw">0.00</b></span>
    </div>
    <canvas class="compass" id="compass" aria-label="Compass: where the world x, y, z and w axes point from your view" role="img"></canvas>
    <div class="hud bottom">Drag to orbit · scroll or pinch to zoom</div>
    <div class="tags" id="stack-tags" hidden><span class="tag"></span><span class="tag"></span><span class="tag"></span></div>`;

export const NAV_HTML = `    <section>
      <h2>View <span>keys 1 · 2 · 3</span></h2>
      <div class="seg view-seg" id="view-mode" role="group" aria-label="View">
        <button type="button" id="vm-slice" data-v="slice">Slice</button><button type="button" id="vm-stack" data-v="stack">Stack</button><button type="button" id="vm-shadow" data-v="shadow">Shadow</button>
      </div>
      <p class="note" id="view-desc"></p>
    </section>

    <section>
      <h2>Move <span>hold to keep going</span></h2>
      <div class="move">
        <div class="cluster planar">
          <button class="key fwd" data-act="move:F:1" id="k-fwd">Forward<kbd>W</kbd></button>
          <button class="key lft" data-act="move:R:-1" id="k-left">Left<kbd>A</kbd></button>
          <button class="key bck" data-act="move:F:-1" id="k-back">Back<kbd>S</kbd></button>
          <button class="key rgt" data-act="move:R:1" id="k-right">Right<kbd>D</kbd></button>
          <small>within slice</small>
        </div>
        <div class="cluster">
          <button class="key" data-act="move:U:1" id="k-up">Up<kbd>R</kbd></button>
          <button class="key" data-act="move:U:-1" id="k-down">Down<kbd>F</kbd></button>
          <small>height</small>
        </div>
        <div class="cluster">
          <button class="key w" data-act="move:A:1" id="k-ana">Ana<kbd>E</kbd></button>
          <button class="key w" data-act="move:A:-1" id="k-kata">Kata<kbd>Q</kbd></button>
          <small>4th axis</small>
        </div>
      </div>
    </section>

    <section>
      <h2>Rotate the slice</h2>
      <div class="rot">
        <div class="lbl">Turn<code>R–F plane</code></div>
        <button class="key" data-act="rot:RF:-1" id="r-tl">Left<kbd>J</kbd></button>
        <button class="key" data-act="rot:RF:1" id="r-tr">Right<kbd>L</kbd></button>
        <div class="lbl">Pitch forward<code>F–A plane</code></div>
        <button class="key w" data-act="rot:FA:-1" id="r-fk">Kata<kbd>K</kbd></button>
        <button class="key w" data-act="rot:FA:1" id="r-fa">Ana<kbd>I</kbd></button>
        <div class="lbl">Swing sideways<code>R–A plane</code></div>
        <button class="key w" data-act="rot:RA:-1" id="r-rk">Kata<kbd>U</kbd></button>
        <button class="key w" data-act="rot:RA:1" id="r-ra">Ana<kbd>O</kbd></button>
      </div>
      <label class="switch vol" for="volume"><input type="checkbox" id="volume"><span></span>Volume view <kbd>V</kbd></label>
      <p class="note">Lays your slice level: the view turns 90° in the up–ana plane, so your ana direction shows as up (that’s w until you tilt) and R/F step through heights. Your own frame and the other controls don’t change.</p>
    </section>`;

export const FRAME_HTML = `    <section>
      <h2>Your frame <span>basis in world x y z w</span></h2>
      <div class="mtx-wrap"><table class="mtx" id="mtx"></table></div>
      <p class="note">The compass in the corner of the view shows the world x, y, z and w axes from your camera. An arrow is shorter the more its axis leaves your slice, and dashed once it is mostly out of it. Axes too short to draw are listed under it: <b>⊥</b> means mostly out of your slice, <b>·</b> means pointing along your line of sight.</p>
    </section>`;
