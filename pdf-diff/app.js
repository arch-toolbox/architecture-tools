// ==============================
// 初期：PDF読み込み＆サムネ管理
// ==============================
const pageList  = document.getElementById("pageList");
const pdfInputA = document.getElementById("pdfInputA");
const pdfInputB = document.getElementById("pdfInputB");

let pageStore = [];

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// PDF → 高画質PNG（Blob URL）
async function loadPDF(file, group) {
  const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);

    const SCALE = 2.5; // 画質
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: SCALE });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width  = viewport.width  * ratio;
    canvas.height = viewport.height * ratio;
    canvas.style.width  = viewport.width  + "px";
    canvas.style.height = viewport.height + "px";

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    await page.render({
      canvasContext: ctx,
      viewport,
      intent: "print"
    }).promise;

    const blobUrl = URL.createObjectURL(
      await new Promise(resolve => canvas.toBlob(resolve, "image/png"))
    );

    pageStore.push({
      id: crypto.randomUUID(),
      fileName: file.name,
      pageNo: i,
      image: blobUrl,
      use: true,
      group
    });
  }
}

// A案（新図面）
pdfInputA.addEventListener("change", async (e) => {
  const files = [...e.target.files];
  for (const file of files) await loadPDF(file, "A");
  renderPages();
  pdfInputA.value = "";
});

// B案（旧図面）
pdfInputB.addEventListener("change", async (e) => {
  const files = [...e.target.files];
  for (const file of files) await loadPDF(file, "B");
  renderPages();
  pdfInputB.value = "";
});

// サムネ一覧
function renderPages() {
  pageList.innerHTML = "";

  pageStore.forEach((p) => {
    const div = document.createElement("div");
    div.dataset.id = p.id;
    div.style.border = "1px solid #ccc";
    div.style.padding = "6px";
    div.style.marginBottom = "6px";

    div.style.background = p.use
      ? (p.group === "A" ? "#e7f0ff" : "#ffe7e7")
      : "#ddd";

    div.innerHTML = `
      <img src="${p.image}" style="width:220px; display:block;">
      <div style="font-size:11px">${p.fileName} / P${p.pageNo}</div>
      <div>${p.group === "A" ? "新図面" : "旧図面"}</div>
      <button onclick="toggleUse('${p.id}')">${p.use ? "除外" : "復帰"}</button>
    `;
    pageList.appendChild(div);
  });

  new Sortable(pageList, {
    animation: 150,
    onEnd: () => {
      const ids = [...pageList.children].map(el => el.dataset.id);
      pageStore.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    }
  });
}

window.toggleUse = function(id){
  const p = pageStore.find(p => p.id === id);
  p.use = !p.use;
  renderPages();
};

// ==============================
// ここから：1ページ完結の差分比較
// ==============================
const compareArea = document.getElementById("compareArea");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let pairs = [];
let index = 0;

// 共通（基本）調整
let base = { dx: 0, dy: 0, rot: 0 };

// ページ別上書き（必要な時だけ）
const perPage = {}; // perPage[index] = { enabled:true, dx,dy,rot }

// 現在適用される調整（ページ別ONならそれ、OFFなら共通）
function cur() {
  if (perPage[index]?.enabled) return perPage[index];
  return base;
}

// 画像
let oldImg = new Image();
let newImg = new Image();

// 黒線抽出＋色付け
function extractLine(img, col){
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const t = c.getContext("2d");
  t.drawImage(img,0,0);

  const d = t.getImageData(0,0,c.width,c.height);
  const data = d.data;

  for(let i=0;i<data.length;i+=4){
    const br = (data[i]+data[i+1]+data[i+2])/3;
    if(br < 200){
      data[i]=col.r; data[i+1]=col.g; data[i+2]=col.b; data[i+3]=col.a;
    } else {
      data[i+3]=0;
    }
  }
  t.putImageData(d,0,0);
  return c;
}

// 差分描画（新図＝青を回転＋移動、旧図＝赤固定）
function computeAndDraw(){
  if (!newImg?.width || !oldImg?.width) return;

  canvas.width  = newImg.width;
  canvas.height = newImg.height;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const oldRed  = extractLine(oldImg,{r:255,g:0,b:0,a:120});
  const newBlue = extractLine(newImg,{r:0,g:120,b:255,a:120});

  const t = cur();

  // 新図（青）を変換
  ctx.save();
  ctx.translate(t.dx, t.dy);

  // 回転はキャンバス中心基準
  ctx.translate(canvas.width/2, canvas.height/2);
  ctx.rotate(t.rot * Math.PI / 180);
  ctx.translate(-canvas.width/2, -canvas.height/2);

  ctx.drawImage(newBlue,0,0);
  ctx.restore();

  // 旧図（赤）固定
  ctx.drawImage(oldRed,0,0);

  // 紫→黒（共通）
  const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
  const d = imgData.data;
  for(let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    if((r+b)>180 && Math.abs(r-b)<120 && g<160){
      d[i]=d[i+1]=d[i+2]=0;
    }
  }
  ctx.putImageData(imgData,0,0);

  // UI表示
  const info = document.getElementById("pageInfo");
  if (info) {
    info.textContent = `ページ ${index+1}/${pairs.length}  dx:${t.dx.toFixed(1)} dy:${t.dy.toFixed(1)} rot:${t.rot.toFixed(2)}°`;
  }

  const toggleBtn = document.getElementById("togglePerPage");
  if (toggleBtn) {
    toggleBtn.textContent = `このページだけ調整：${perPage[index]?.enabled ? "ON" : "OFF"}`;
  }
}

// 画像ロード
function loadImages(){
  oldImg = new Image();
  newImg = new Image();

  oldImg.src = pairs[index].B;
  newImg.src = pairs[index].A;

  newImg.onload = () => computeAndDraw();
  newImg.onerror = () => alert("画像の読み込みに失敗しました（blob URL）");
}

// ==============================
// UI：ページ送り・戻る
// ==============================
document.getElementById("prevBtn").onclick = () => {
  if(index > 0){ index--; loadImages(); }
};
document.getElementById("nextBtn").onclick = () => {
  if(index < pairs.length - 1){ index++; loadImages(); }
};
document.getElementById("backBtn").onclick = () => {
  compareArea.style.display = "none";
  pageList.style.display = "";
};

// ==============================
// UI：回転ボタン（±）
// ==============================
const ROT_STEP = 0.10; // 0.10°刻み（必要なら0.01へ）
document.getElementById("rotL").onclick = () => { cur().rot -= ROT_STEP; computeAndDraw(); };
document.getElementById("rotR").onclick = () => { cur().rot += ROT_STEP; computeAndDraw(); };

// ==============================
// UI：ページ別ON/OFF、全ページ適用、ページリセット
// ==============================
document.getElementById("togglePerPage").onclick = () => {
  if (!perPage[index]) perPage[index] = { enabled:true, dx: base.dx, dy: base.dy, rot: base.rot };
  perPage[index].enabled = !perPage[index].enabled;
  computeAndDraw();
};

document.getElementById("applyToAll").onclick = () => {
  const t = cur();
  base.dx = t.dx; base.dy = t.dy; base.rot = t.rot;
  // 例外ページをOFFに戻す（基本は共通に寄せる）
  for (const k in perPage) perPage[k].enabled = false;
  computeAndDraw();
};

document.getElementById("resetPage").onclick = () => {
  // このページだけ共通値へ戻す
  perPage[index] = { enabled:false, dx: base.dx, dy: base.dy, rot: base.rot };
  computeAndDraw();
};

// ==============================
// 操作：ドラッグで移動
// ==============================
let dragging = false;
let dragStart = { x:0, y:0 };
let startDx = 0, startDy = 0;

canvas.addEventListener("mousedown", (e) => {
  if (compareArea.style.display === "none") return;
  dragging = true;
  const t = cur();
  startDx = t.dx; startDy = t.dy;
  dragStart = { x: e.clientX, y: e.clientY };
});

window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const t = cur();
  t.dx = startDx + (e.clientX - dragStart.x);
  t.dy = startDy + (e.clientY - dragStart.y);
  computeAndDraw();
});

window.addEventListener("mouseup", () => dragging = false);

// ==============================
// 操作：方向キー（最小移動のみ）＋スクロール抑止
// ==============================
document.addEventListener("keydown", (e) => {
  if (compareArea.style.display === "none") return;

  // 方向キーのブラウザスクロールを止める
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
  } else {
    return;
  }

  const step = 0.5; // 最小移動
  const t = cur();

  if (e.key === "ArrowUp")    t.dy -= step;
  if (e.key === "ArrowDown")  t.dy += step;
  if (e.key === "ArrowLeft")  t.dx -= step;
  if (e.key === "ArrowRight") t.dx += step;

  computeAndDraw();
}, { passive: false });


// ==============================
// startCompare（遷移しない）
// ==============================
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("startCompare").addEventListener("click", () => {

    const pagesA = pageStore.filter(p => p.use && p.group === "A");
    const pagesB = pageStore.filter(p => p.use && p.group === "B");

    if (pagesA.length === 0 || pagesB.length === 0) {
      alert("新図面・旧図面の両方を読み込んでください");
      return;
    }

    const len = Math.min(pagesA.length, pagesB.length);
    pairs = [];
    for(let i=0;i<len;i++){
      pairs.push({ A: pagesA[i].image, B: pagesB[i].image });
    }

    index = 0;
    base = { dx: 0, dy: 0, rot: 0 };
    // perPageは残しても良いが、比較開始時にクリアしたいなら次行をON
    // for (const k in perPage) delete perPage[k];

    pageList.style.display = "none";
    compareArea.style.display = "";

    loadImages();
    canvas.tabIndex = 0;
canvas.focus();

  });
});

