import test from 'node:test';
import assert from 'node:assert/strict';
import {writeZip, readZip} from '../scripts/zip.mjs';

test('zip round-trips files with forward-slash paths, compressed and stored', () => {
  const entries = [
    {name: 'How to install.txt', data: Buffer.from('Step 1\r\nStep 2\r\n')},
    {
      name: 'lesson-studio/manifest.json',
      data: Buffer.from('{"version":"1.3.1"}'.repeat(50)),
    },
    {
      name: 'lesson-studio/icons/icon-16.png',
      data: Buffer.from([137, 80, 78, 71, 0, 1, 2, 3]),
    },
    {name: 'lesson-studio/empty.txt', data: Buffer.alloc(0)},
  ];
  const back = readZip(writeZip(entries));
  assert.deepEqual(
    back.map(e => e.name),
    entries.map(e => e.name)
  );
  for (const [i, e] of back.entries())
    assert.ok(e.data.equals(entries[i].data), e.name);
});

test('zip refuses backslash or absolute paths', () => {
  assert.throws(
    () =>
      writeZip([
        {name: 'lesson-studio\\manifest.json', data: Buffer.from('x')},
      ]),
    /forward slashes/
  );
  assert.throws(
    () => writeZip([{name: '/etc/x', data: Buffer.from('x')}]),
    /relative/
  );
});
