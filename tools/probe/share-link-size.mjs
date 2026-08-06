// How big is a share link for a level the size of a real project?
//
// `encodeLevel` is JSON -> gzip -> base64url, so the CODEC cannot lose anything — a share link round-trips
// by construction. The question is size. The share button already computes the length and reports it, and
// says nothing about whether that length will survive being pasted anywhere.
//
// A URL hash is never sent to a server, so server request-line limits do not apply — which is in the
// engine's favour and worth knowing before picking a threshold. What DOES bite is what a browser accepts
// in its address bar and what a chat client carries intact.
//
// So: measure the real curve, on a level built the way a gauntlet is built.
import { withGame } from './driver.mjs';

await withGame(async (probe) => {
  const r = await probe(`(async function(){
    const R = { rows: [] };
    const base = propModels.length;

    async function measure(label){
      const lvl = serializeLevel();
      const json = JSON.stringify(lvl).length;
      const enc = await encodeLevel(lvl);
      const link = buildShareLink(enc);
      return { label: label, props: propModels.length, json: json, code: enc.length, link: link.length,
               ratio: +(json / enc.length).toFixed(1) };
    }

    R.rows.push(await measure('stock level'));

    /* Grow it the way a gauntlet grows: tagged, signalled, materialled props — not bare boxes, because a
       bare box compresses far better than a real one and would flatter the number. */
    const made = [];
    function add(n){
      for(let i = 0; i < n; i++){
        const k = made.length;
        let o = null;
        spawnProp('box', [120 + (k % 20) * 3, 0, 120 + Math.floor(k / 20) * 3, 0, k * 0.017, 0, 1.5, 2, 1], (b)=>{o=b;});
        if(!o) continue;
        o.userData.tag = 'booth' + (k % 12);
        o.userData.nm = 'Prop ' + k;
        o.userData.maxHp = 30 + (k % 40);
        o.userData.signals = [{ when:'destroyed', do:'open', target:'door' + (k % 7) }];
        made.push(o);
      }
    }

    for(const target of [100, 250, 500]){
      add(target - made.length);
      R.rows.push(await measure(target + ' extra props'));
    }

    for(const o of made){ const i = propModels.indexOf(o); if(i >= 0) removeProp(i); }
    R.base = base;
    /* what the SHARE BUTTON says about any of this */
    R.buttonSays = (typeof document !== 'undefined');
    return R;
  })()`);

  console.log('        stock level had ' + r.base + ' props\n');
  console.log('        ' + 'level'.padEnd(18) + 'props'.padStart(6) + 'JSON'.padStart(10) +
              'code'.padStart(9) + 'LINK'.padStart(9) + '   gzip');
  for (const x of r.rows) {
    console.log('        ' + x.label.padEnd(18) + String(x.props).padStart(6) +
                String(x.json).padStart(10) + String(x.code).padStart(9) +
                String(x.link).padStart(9) + '   ' + x.ratio + 'x');
  }
  console.log('');
  const big = r.rows[r.rows.length - 1];
  console.log('        A URL hash is never sent to a server, so there is no request-line limit here.');
  console.log('        What bites: a browser address bar, and a chat client carrying it intact.');
  console.log('        At ' + big.props + ' props the link is ' + big.link + ' characters.\n');
}, { settleMs: 3000 });
