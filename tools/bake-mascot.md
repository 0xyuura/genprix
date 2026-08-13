# Baking the kart mascot sprite

`public/brand/mochi-kart.webp` (+ the `.png` fallback) is a **build artifact**, baked
once from `tools/mascot-sheet.png`. The sheet itself is deliberately *not* in `public/`
so it never ships to visitors — it is 1.1 MB, and the game only needs one 264x320 pose.

Why it is baked instead of cropped at runtime: the old `src/mascot.ts` downloaded the
full sheet, cropped the front pose, and ran an edge flood-fill to knock out the
background. Measured on a desktop that cost **1.13 MB of transfer + ~176 ms of blocked
main thread per visitor** — and the flood fill removed nothing at all, because the sheet
already carries an alpha channel (the crop border samples as `rgba(0,0,0,0)`, which the
`isBg` test rejects immediately).

## Regenerating

Crop box for the front pose inside the 4000x2437 sheet: `x=150 y=520 w=1320 h=1620`.
Downscale in two steps (1320x1620 -> 660x810 -> 264x320) so the result stays crisp.

With gstack browse (what was used to produce the committed files), serve the repo and run:

```bash
B=~/.claude/skills/gstack/browse/dist/browse

# WebP, ~22 KB — what everyone actually downloads
$B eval /tmp/bake.js --out public/brand/mochi-kart.webp

# PNG, ~69 KB — fallback for browsers that cannot decode WebP
$B eval /tmp/bake-png.js --out public/brand/mochi-kart.png
```

where `/tmp/bake.js` is:

```js
new Promise(r=>{const im=new Image();im.onerror=()=>r('err');im.onload=()=>{
const F={x:150,y:520,w:1320,h:1620};
const a=document.createElement('canvas');a.width=660;a.height=810;
const ax=a.getContext('2d');ax.imageSmoothingEnabled=true;ax.imageSmoothingQuality='high';
ax.drawImage(im,F.x,F.y,F.w,F.h,0,0,660,810);
const b=document.createElement('canvas');b.width=264;b.height=320;
const bx=b.getContext('2d');bx.imageSmoothingEnabled=true;bx.imageSmoothingQuality='high';
bx.drawImage(a,0,0,660,810,0,0,264,320);
r(b.toDataURL('image/webp',0.92));};im.src='/brand/mascot-sheet.png';})
```

(For the PNG, swap the last line to `r(b.toDataURL('image/png'))`. Both need the sheet
reachable at `/brand/mascot-sheet.png`, so copy it into `public/brand/` for the bake and
remove it again afterwards.)

## Sizing

264x320 is ~2x headroom over the largest on-screen size. `drawKart` renders the mascot
at a fixed 96 canvas units tall, scaled by `h/520` where `h` is the canvas CSS height
(~336-400 px), so it paints at roughly 62-74 CSS px — about 150 device px at DPR 2.
