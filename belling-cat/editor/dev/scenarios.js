// Scripted interactions for headless checks: open /?run=<name>. Events are dispatched on the
// canvas exactly as a user would produce them, then the page records "done" in #status.
(function () {
  const name = new URLSearchParams(location.search).get("run");
  if (!name) return;
  const canvas = document.getElementById("canvas");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const r = () => canvas.getBoundingClientRect();
  const mouse = (type, x, y, extra = {}) =>
    canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r().left + x, clientY: r().top + y, button: 0, ...extra }));
  const key = (k, code = k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, code, bubbles: true }));
  const click = async (x, y) => { mouse("mousedown", x, y); await sleep(20); window.dispatchEvent(new MouseEvent("mouseup")); await sleep(20); };
  const drag = async (x0, y0, x1, y1) => {
    mouse("mousedown", x0, y0); await sleep(20);
    for (let i = 1; i <= 5; i++) { mouse("mousemove", x0 + ((x1 - x0) * i) / 5, y0 + ((y1 - y0) * i) / 5); await sleep(10); }
    window.dispatchEvent(new MouseEvent("mouseup")); await sleep(50);
  };
  const scenarios = {
    async draw() {
      key("p", "KeyP");
      for (const [x, y] of [[150, 150], [300, 120], [340, 300], [220, 360], [120, 280]]) { mouse("mousedown", x, y); await sleep(20); }
      key("Enter");
    },
    async move_vertex() {
      // Select the council cut by clicking inside it, then drag its first vertex.
      const c = window.__editor.toScreen([0, -20]);
      await click(c[0], c[1]);
      const v = window.__editor.toScreen([-285, 360]);
      await drag(v[0], v[1], v[0] - 60, v[1] - 40);
    },
    async move_cut() {
      const c = window.__editor.toScreen([760, -20]);
      await drag(c[0], c[1], c[0] + 50, c[1] + 30);
    },
    async child_move() {
      // Click the candle sprite in the council cut, drag it right/up, then resize via the bottom-right corner.
      const c = window.__editor.toScreen([0, -166]);
      await drag(c[0], c[1], c[0] + 40, c[1] - 30);
      const br = window.__editor.toScreen([40 + 20, -136 - 40]);
      await drag(br[0], br[1], br[0] + 20, br[1] + 20);
    },
    async balloon_tail() {
      // Select the elder's first balloon, switch it to shout via the panel, then drag the tail tip.
      window.__editor.select(1, 1);
      const kind = document.querySelector("#props select");
      kind.value = "shout"; kind.dispatchEvent(new Event("change"));
      await sleep(100);
      window.__editor.select(1, 1);
      const tip = window.__editor.toScreen([-330 + 70, 1050 - 320]);
      await drag(tip[0], tip[1], tip[0] - 120, tip[1] + 40);
      // Make the second balloon a thought cloud.
      window.__editor.select(1, 2);
      const kind2 = document.querySelector("#props select");
      kind2.value = "thought"; kind2.dispatchEvent(new Event("change"));
      await sleep(100);
    },
    async add_child() {
      window.__editor.select(3, -1);
      const buttons = [...document.querySelectorAll("#props button")];
      buttons.find((b) => b.textContent === "balloon").click();
      await sleep(100);
      buttons.find((b) => b.textContent === "sprite") && [...document.querySelectorAll("#props button")].find((b) => b.textContent === "← door")?.click();
      await sleep(50);
      [...document.querySelectorAll("#props button")].find((b) => b.textContent === "sprite")?.click();
    },
    async snap_vertex() {
      // Select the council cut, then drag its top-left vertex to about (-292, 352): within the
      // threshold of the neighbours' lines x=-285 and y=360, so it should land back on (-285, 360).
      const c = window.__editor.toScreen([-200, 100]); // inside the cut, clear of children
      await click(c[0], c[1]);
      // Drag the top-left vertex toward (-240, 352): x is far from any line, y is within the
      // threshold of the top edge y=360, so the result should be exactly (-240, 360).
      const v = window.__editor.toScreen([-285, 360]);
      const target = window.__editor.toScreen([-240, 352]);
      await drag(v[0], v[1], target[0], target[1]);
    },
    async snap_child() {
      // Drag the candle to about (6, -234): its centre should snap to the cut centre line x=0.
      const c = window.__editor.toScreen([0, -166]);
      const t = window.__editor.toScreen([6, -234]);
      await drag(c[0], c[1], t[0], t[1]);
    },
    async preview() {
      document.getElementById("btn-play").click();
      window.__editor.advancePreview(1.0); // slide to elder_closeup done; say b_elder_1 waiting
      key(" ", "Space"); // next Z -> say b_elder_2
      window.__editor.advancePreview(0.1);
    },
  };
  window.addEventListener("message", async (e) => {
    if (e.data.type !== "init") return;
    await sleep(200);
    try {
      await scenarios[name]();
      await sleep(200);
      document.getElementById("status").textContent += " [scenario done]";
    } catch (err) {
      document.getElementById("status").textContent = "[scenario error] " + (err && err.stack || err);
    }
  });
})();
