const test = require('node:test');
const assert = require('node:assert');
const LK = require('../frontend/js/links.js');
const RES = require('../frontend/js/resources.js');

test('quickmapBase is exactly the Quickmap view supplied for the project', () => {
  assert.strictEqual(LK.quickmapBase(),
    'https://quickmap.lroc.im-ldi.com/?prjExtent=-3335249.7991968%2C-1737400%2C3335249.7991968%2C1737400&earthShadowEnabled=true&proj=10&stack=3314&defs=N4IgzGCMAsIFygPYAcCGBjAlgFwJ70gF9Cg');
});

test('quickmapURL keeps layers/projection and centres the extent on the site', () => {
  const u = LK.quickmapURL(0.67408, 23.47297, 100);
  assert.ok(u.includes('earthShadowEnabled=true') && u.includes('proj=10') && u.includes('stack=3314'));
  const ext = decodeURIComponent(u.split('prjExtent=')[1].split('&')[0]).split(',').map(Number);
  assert.strictEqual(ext.length, 4);
  assert.ok(Math.abs((ext[0] + ext[2]) / 2 - 1737400 * 23.47297 * Math.PI / 180) < 1);
  assert.ok(Math.abs((ext[1] + ext[3]) / 2 - 1737400 * 0.67408 * Math.PI / 180) < 1);
  assert.ok(Math.abs((ext[2] - ext[0]) - 200000) < 1);
  assert.ok(ext[1] < ext[3]);
});

test('resources: every entry is https, Quickmap uses the supplied view, CSA topics are listed', () => {
  const all = [...RES.resources, ...RES.csaTopics];
  all.forEach((r) => assert.match(r.url, /^https:\/\//, r.name));
  assert.strictEqual(RES.resources.find((r) => r.id === 'quickmap').url, LK.quickmapBase());
  assert.ok(RES.csaTopics.length >= 5);
  RES.csaTopics.forEach((t) => assert.match(t.url, /^https:\/\/www\.asc-csa\.gc\.ca\//));
});
