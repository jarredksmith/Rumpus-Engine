// (build 866) SNOW AT BOOT CRASHED — build 864 declared `_weatherSpriteTex` down in the weather block,
// but applyWorldCfg calls refreshWeather() at boot: a SAVED level with snow active reached
// _weatherSprite() before the declaration executed (TDZ). The stock boot test missed it because it
// boots with weather 'none', which early-returns before the sprite. The declaration now lives with the
// rest of the weather state above applyWorldCfg, and this test CONSTRUCTS both weather kinds for real.
import { gameSource, extractFunction, assert, eq, done } from './harness.mjs';
const src = gameSource();

// every piece of state refreshWeather touches must be declared before applyWorldCfg (boot call order)
const awc = src.indexOf('function applyWorldCfg');
for(const decl of ["let _weatherPts=null", "let _weatherSpriteTex=null", "const _WEATHER_BOX"])
  assert(src.indexOf(decl) >= 0 && src.indexOf(decl) < awc, decl + ' is declared before applyWorldCfg');

// build snow AND rain for real in a sandbox — the construction path, not just source order
const mkCtx = (weather)=>{
  const added=[];
  const canvas={ width:0, height:0, getContext:()=>({ createRadialGradient:()=>({ addColorStop(){} }), fillRect(){}, fillStyle:null }) };
  const ctx = {
    worldCfg:{ weather, weatherAmt:0.5, weatherSize:1, weatherWind:1, weatherWindDir:90 },
    IS_COARSE:false, scene:{ add:(o)=>added.push(o), remove(){} },
    document:{ createElement:()=>canvas },
    THREE:{
      BufferGeometry:class{ setAttribute(){} dispose(){} },
      BufferAttribute:class{}, CanvasTexture:class{},
      PointsMaterial:class{ constructor(o){ Object.assign(this,o); } dispose(){} },
      LineBasicMaterial:class{ constructor(o){ Object.assign(this,o); } dispose(){} },
      Points:class{ constructor(g,m){ this.kind='points'; this.geometry=g; this.material=m; this.userData={}; } },
      LineSegments:class{ constructor(g,m){ this.kind='lines'; this.geometry=g; this.material=m; this.userData={}; } },
    },
    Math, Float32Array, added,
  };
  return ctx;
};
const body = "let _weatherPts=null, _weatherKind='none', _weatherData=null, _weatherT=0; let _weatherSpriteTex=null;\nconst _WEATHER_BOX = { w:46, h:30 };\n"
  + extractFunction('_weatherSprite') + '\n' + extractFunction('refreshWeather') + '\nrefreshWeather();\nreturn added[0];';
const run = (weather)=>{ const c=mkCtx(weather); return new Function(...Object.keys(c), body)(...Object.values(c)); };
eq(run('snow').kind, 'points', 'snow constructs (the path that crashed at boot)');
assert(run('snow').material.map instanceof Object, '...with the sprite texture attached');
eq(run('rain').kind, 'lines', 'rain constructs as streaks');
eq(run('none'), undefined, 'weather none builds nothing');

done('build 866: weather state hoisted above applyWorldCfg; snow/rain construction runs for real in-sandbox');
