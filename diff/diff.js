/* ----------------------------------------
   内部座標クリック（ズレゼロ必須）
---------------------------------------- */
function getClickPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top ) * (canvas.height / rect.height)
  };
}

/* ---------------------------------------- */
let mode = "delete";
let stage = 0;

// ▼ 追加：新図用オフセット＆ロックフラグ
let offsetX = 0;
let offsetY = 0;
let positionLocked = false;

function setMode(m){
  mode = m;
  if(stage === 4){    // 基準点取得済みなら即反映
    computeAndDraw();
  }
  guide("モード：" + m);
}

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let oldImg = null, newImg = null;
let pointsOld = [], pointsNew = [];

/* ------------------------------ */
document.getElementById("oldImgInput").addEventListener("change", e=>{
  loadImage(e.target.files[0], img=>{ oldImg=img; resetGuide(); });
});
document.getElementById("newImgInput").addEventListener("change", e=>{
  loadImage(e.target.files[0], img=>{ newImg=img; resetGuide(); });
});

function loadImage(file, cb){
  const r = new FileReader();
  r.onload = ev =>{
    const img = new Image();
    img.onload = ()=>cb(img);
    img.src = ev.target.result;
  };
  r.readAsDataURL(file);
}

/* ------------------------------
   基準点取得の流れ
------------------------------ */
function resetGuide(){
  if(oldImg && newImg){
    stage = 0;
    pointsOld = [];
    pointsNew = [];

    canvas.width  = oldImg.width;
    canvas.height = oldImg.height;
    ctx.drawImage(oldImg,0,0);

    guide("旧図面：基準点①をクリック");
  }
}
function guide(t){ document.getElementById("guide").innerText = t; }
function lockPosition(){
  positionLocked = true;
  guide("位置を確定しました（矢印キーでの移動は無効）");
}

/* ------------------------------ */
canvas.addEventListener("click", e=>{
  if(!oldImg || !newImg) return;

  document.addEventListener("keydown", e=>{
    // 基準点4つ取り終わっていない or 位置確定後は動かさない
    if(stage !== 4 || positionLocked) return;

    const step = 0.5; // 0.5pxずつ動かす。必要なら 2,5 などに変更可

    if(e.key === "ArrowUp")    offsetY -= step;
    if(e.key === "ArrowDown")  offsetY += step;
    if(e.key === "ArrowLeft")  offsetX -= step;
    if(e.key === "ArrowRight") offsetX += step;

    // 新しいオフセットで再描画
    computeAndDraw();
  });

  const pos = getClickPos(e, canvas);  // ← これをそのまま使う

  if(stage === 0){
    pointsOld.push(pos);
    drawPoint(pos,"red");
    stage=1; guide("旧図面：基準点②をクリック");
  }
  else if(stage === 1){
    pointsOld.push(pos);
    drawPoint(pos,"red");
    stage=2;
    canvas.width=newImg.width; canvas.height=newImg.height;
    ctx.drawImage(newImg,0,0);
    guide("新図面：基準点①をクリック");
  }
  else if(stage === 2){
    pointsNew.push(pos);
    drawPoint(pos,"blue");
    stage=3; guide("新図面：基準点②をクリック");
  }
  else if(stage === 3){
    pointsNew.push(pos);
    drawPoint(pos,"blue");
    stage=4;
    guide("重ね合わせ中…");
    computeAndDraw();
  }
});

/* ------------------------------ */
function drawPoint(p,color){
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.arc(p.x,p.y,5,0,Math.PI*2);
  ctx.fill();
}

/* ------------------------------
   黒線 → 指定色化
------------------------------ */
function extractLine(img, col){
  const c = document.createElement("canvas");
  c.width=img.width; c.height=img.height;
  const t=c.getContext("2d");
  t.drawImage(img,0,0);

  const d=t.getImageData(0,0,c.width,c.height);
  const data=d.data;

  for(let i=0;i<data.length;i+=4){
    const br=(data[i]+data[i+1]+data[i+2])/3;
    if(br<200){
      data[i]=col.r; data[i+1]=col.g; data[i+2]=col.b;
      data[i+3]=col.a;
    }else data[i+3]=0;
  }
  t.putImageData(d,0,0);
  return c;
}

/* ----------------------------------------
   ★ズレゼロの transformAndDraw（あなたの式）
---------------------------------------- */
function transformAndDraw(imgCanvas, A1, B1, A2, B2){
  function dist(p,q){ return Math.hypot(q.x-p.x,q.y-p.y); }
  function ang(p,q){ return Math.atan2(q.y-p.y,q.x-p.x); }

  const scale = dist(A2,B2)/dist(A1,B1);
  const rot   = ang(A2,B2)-ang(A1,B1);

  ctx.save();
  ctx.translate(A2.x,A2.y);
  ctx.rotate(rot);
  ctx.scale(scale,scale);
  ctx.translate(-A1.x,-A1.y);
  ctx.drawImage(imgCanvas,0,0);
  ctx.restore();
}

/* ----------------------------------------
   ★ズレない3モード完全版 computeAndDraw
---------------------------------------- */
function computeAndDraw(){
  const A1 = pointsOld[0], B1 = pointsOld[1];
  const A2 = pointsNew[0], B2 = pointsNew[1];

  canvas.width=newImg.width;
  canvas.height=newImg.height;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const oldRed   = extractLine(oldImg,{r:255,g:0,b:0,a:100});
  const oldBlack = extractLine(oldImg,{r:0,g:0,b:0,a:255});
  const newBlue  = extractLine(newImg,{r:0,g:120,b:255,a:100});
  const newBlack = extractLine(newImg,{r:0,g:0,b:0,a:255});

  /* --------------------------
     ① 削除チェック（動作OK）
  --------------------------- */
  if(mode==="delete"){
    transformAndDraw(oldRed, A1,B1, A2,B2);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.drawImage(newBlack,0,0);
    ctx.restore();
  }

  /* --------------------------
     ② 追記チェック（完全修正版）
  --------------------------- */
  else if(mode==="add"){
    // 新図（青）だけ方向キーで微調整
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.drawImage(newBlue,0,0);
    ctx.restore();

    // 旧図（黒）は基準点に沿って固定
    transformAndDraw(oldBlack, A1,B1, A2,B2);
  }

  /* --------------------------
     ③ 統合（完全修正版）
  --------------------------- */
  else if(mode==="mix"){

    // 新図（青）＋その黒共通部分は「新図側」とみなし、方向キーで微調整
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.drawImage(newBlue,0,0);
    ctx.restore();

    // 旧図（赤）は基準点で固定
    transformAndDraw(oldRed, A1,B1, A2,B2);

    // ↓ 紫の領域だけ黒に置換
    let imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
    let d = imgData.data;

    for(let i=0; i<d.length; i+=4){
      let r = d[i];
      let g = d[i+1];
      let b = d[i+2];

      // ★ a=100 での最適紫判定
      if(
        (r + b) > 180 &&        // 紫は赤+青が多い
        Math.abs(r - b) < 120 &&// 赤と青の差はそこまで大きくない
        g < 160                 // 緑は低め
      ){
        // 黒に置換
        d[i]   = 0;
        d[i+1] = 0;
        d[i+2] = 0;
      }
    }

    ctx.putImageData(imgData,0,0);
  }

  guide("比較処理 完了（モード："+mode+"）");
}

/* ---------------------------------------- */
function savePNG(){

  // === 0) newBlue / oldRed を再生成（必須） ===
  const oldRed   = extractLine(oldImg,{r:255,g:0,b:0,a:150});
  const newBlue  = extractLine(newImg,{r:0,g:120,b:255,a:150});

  // === 1) 出力専用キャンバス ===
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const octx = out.getContext("2d");

  // === 2) 背景白 ===
  octx.fillStyle = "#ffffff";
  octx.fillRect(0,0,out.width,out.height);

  // === 3) 新図（青）＋オフセット反映 ===
  octx.save();
  octx.translate(offsetX, offsetY);
  octx.drawImage(newBlue,0,0);
  octx.restore();

  // === 4) 旧図（赤）を新図座標に変換 ===
  const A1 = pointsOld[0], B1 = pointsOld[1];
  const A2 = pointsNew[0], B2 = pointsNew[1];

  function dist(p,q){ return Math.hypot(q.x-p.x,q.y-p.y); }
  function ang(p,q){ return Math.atan2(q.y-p.y,q.x-p.x); }

  (function(){
    const scale = dist(A2,B2) / dist(A1,B1);
    const rot   = ang(A2,B2) - ang(A1,B1);

    octx.save();
    octx.translate(A2.x, A2.y);
    octx.rotate(rot);
    octx.scale(scale, scale);
    octx.translate(-A1.x, -A1.y);
    octx.drawImage(oldRed, 0, 0);
    octx.restore();
  })();

  // === 5) 紫 → 黒変換 ===
  let imgData = octx.getImageData(0,0,out.width,out.height);
  let d = imgData.data;

  for(let i=0; i<d.length; i+=4){
    let r = d[i];
    let g = d[i+1];
    let b = d[i+2];

    // ★ 紫（重なり）だけ黒化する安全判定
    if (g < 100) { // 緑は低め
      d[i]   = 0;
      d[i+1] = 0;
      d[i+2] = 0;
    }
  }

  octx.putImageData(imgData,0,0);

  // === 背景白化 ===
  let imgData2 = octx.getImageData(0,0,out.width,out.height);
  let d2 = imgData2.data;

  for(let i=0; i<d2.length; i+=4){
    let r = d2[i];
    let g = d2[i+1];
    let b = d2[i+2];
    let a = d2[i+3];

    // 透明 or 白っぽい部分 → 完全な白に
    if(a < 10 || (r+g+b) > 730){
      d2[i]   = 255;
      d2[i+1] = 255;
      d2[i+2] = 255;
      d2[i+3] = 255;
    }
  }

  octx.putImageData(imgData2,0,0);

  // === 6) PNG保存 ===
  const a = document.createElement("a");
  a.download = "diff.png";
  a.href = out.toDataURL("image/png");
  a.click();
}
