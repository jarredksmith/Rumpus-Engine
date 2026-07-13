// (build 939) BREACH HAS ITS OWN FILE EXTENSION — levels and campaigns export as .breach files
// instead of anonymous .json. The payload is unchanged (plain JSON inside, hand-editable), every
// import picker accepts BOTH .breach and legacy .json (old exports import forever), and the import
// path itself never looked at the filename — it JSON.parses the content and dispatches on the
// payload's `kind` — so nothing else had to change.
import { gameSource, html, assert, done } from './harness.mjs';

const src = gameSource();

// exports carry the new extension
assert(/a\.download = 'rumpus-level-' \+ stamp \+ '\.rumpus';/.test(src), 'levels export as .rumpus (build 952)');
assert(/a\.download = 'rumpus-campaign-' \+ stamp \+ '\.rumpus';/.test(src), 'campaigns export as .rumpus (build 952)');
assert(/share the \.rumpus file/.test(src), 'the toasts name the new extension');
assert(!/\.download = 'breach-(level|campaign)-' \+ stamp \+ '\.json'/.test(src), 'no export still hands out .json');

// every picker accepts .breach AND legacy .json
assert(/id="menuCampFile" accept="\.rumpus,\.breach,\.json,application\/json"/.test(html), 'menu campaign picker accepts all three');
assert(/_campImp\.accept='\.rumpus,\.breach,\.json,application\/json';/.test(src), 'campaign panel picker accepts all three');
assert(/id="edImportFile" accept="\.rumpus,\.breach,\.json,application\/json"/.test(src), 'editor level picker accepts all three');

// the importer is content-sniffing, not extension-sniffing (why legacy files keep working)
assert(/data = JSON\.parse\(reader\.result\)/.test(src), 'import parses the content');
assert(/kind:'breach-campaign'/.test(src), 'campaign payloads are tagged by kind, not filename');

done('build 939: .breach files — custom extension for saved levels and campaigns, legacy .json imports forever');
