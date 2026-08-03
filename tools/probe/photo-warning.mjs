// build 1333 — the photosensitivity warning. Three questions, and the second is the one that makes it a
// feature rather than a nag: does it appear for a NEW browser, does it stay away for a returning one, and
// does its "Reduce flashing" button actually reach build 1313's sliders?
import { withGame } from './driver.mjs';

const read = async (page) => page.evaluate(() => {
  const back = document.querySelector('.uiDlgBack');
  return { up: !!back,
    head: back ? back.innerText.split('\n')[0] : null,
    buttons: back ? [...back.querySelectorAll('button')].map(b => b.textContent) : [],
    acked: localStorage.getItem('breach_photowarn') };
});

console.log('== FIRST RUN (a browser that has never opened the game)');
await withGame(async (P, page) => {
  console.log('  ' + JSON.stringify(await read(page)));
  console.log('  a11y before      ' + JSON.stringify(await P('a11y')));
  await page.evaluate(() => [...document.querySelectorAll('.uiDlgBack button')]
    .find(b => /Reduce/.test(b.textContent)).click());
  await new Promise(r => setTimeout(r, 400));
  console.log('  a11y after       ' + JSON.stringify(await P('a11y')));
  console.log('  dialog now       ' + JSON.stringify(await read(page)));
}, { firstRun: true, settleMs: 3000 });

console.log('\n== RETURNING (breach_photowarn already 1) — it must NOT reappear');
await withGame(async (P, page) => {
  console.log('  ' + JSON.stringify(await read(page)));
  console.log('  a11y             ' + JSON.stringify(await P('a11y')) + '   <- untouched: the notice never fired');
  // and it is still reachable ON PURPOSE from the pause fold
  const forced = await P('photosensitivityWarning(true)');
  await new Promise(r => setTimeout(r, 300));
  console.log('  forced           returned ' + forced + ', ' + JSON.stringify(await read(page)));
}, { settleMs: 3000 });
