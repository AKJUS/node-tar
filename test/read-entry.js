'use strict'
const t = require('tap')
const ReadEntry = require('../lib/read-entry.js')
const Header = require('../lib/header.js')

t.test('create read entry', t => {
  const h = new Header({
    fieldset: 'xstar',
    path: 'foo.txt',
    mode: 0o755,
    uid: 24561,
    gid: 20,
    size: 100,
    mtime: new Date('2016-04-01T22:00Z'),
    ctime: new Date('2016-04-01T22:00Z'),
    atime: new Date('2016-04-01T22:00Z'),
    type: 'File',
    uname: 'isaacs',
    gname: 'staff'
  })
  h.encode()

  const entry = new ReadEntry(h, { x: 'y' }, { z: 0, a: null, b: undefined })

  t.ok(entry.header.cksumValid, 'header checksum should be valid')

  t.match(entry, {
    extended: { x: 'y' },
    globalExtended: { z: 0, a: null, b: undefined },
    header: {
      cksumValid: true,
      needPax: false,
      path: 'foo.txt',
      mode: 493,
      uid: 24561,
      gid: 20,
      size: 100,
      mtime: new Date('2016-04-01T22:00:00.000Z'),
      cksum: 6745,
      typeKey: '0',
      type: 'File',
      linkpath: null,
      ustar: null,
      ustarver: null,
      uname: 'isaacs',
      gname: 'staff',
      devmaj: null,
      devmin: null,
      ustarPrefix: null,
      xstarPrefix: null,
      prefixTerminator: null,
      atime: new Date('2016-04-01T22:00:00.000Z'),
      ctime: new Date('2016-04-01T22:00:00.000Z')
    },
    blockRemain: 512,
    remain: 100,
    type: 'File',
    meta: false,
    ignore: false,
    path: 'foo.txt',
    mode: 493,
    uid: 24561,
    gid: 20,
    uname: 'isaacs',
    gname: 'staff',
    size: 100,
    mtime: new Date('2016-04-01T22:00:00.000Z'),
    atime: new Date('2016-04-01T22:00:00.000Z'),
    ctime: new Date('2016-04-01T22:00:00.000Z'),
    linkpath: null,
    x: 'y',
    z: 0
  })

  let data = ''
  let ended = false
  entry.on('data', c => data += c)
  entry.on('end', _ => ended = true)

  const body = Buffer.alloc(512)
  body.write(new Array(101).join('z'), 0)
  entry.write(body)
  entry.end()

  t.equal(data, new Array(101).join('z'))
  t.ok(ended, 'saw end event')

  t.end()
})

t.test('meta entry', t => {
  const h = new Header({
    fieldset: 'xstar',
    path: 'PaxHeader/foo.txt',
    mode: 0o755,
    uid: 24561,
    gid: 20,
    size: 23,
    mtime: new Date('2016-04-01T22:00Z'),
    ctime: new Date('2016-04-01T22:00Z'),
    atime: new Date('2016-04-01T22:00Z'),
    type: 'NextFileHasLongLinkpath',
    uname: 'isaacs',
    gname: 'staff'
  })
  const body = Buffer.alloc(512)
  body.write('not that long, actually')

  const expect = 'not that long, actually'
  let actual = ''

  const entry = new ReadEntry(h)
  entry.on('data', c => actual += c)

  entry.write(body.slice(0, 1))
  entry.write(body.slice(1, 25))
  entry.write(body.slice(25))
  t.throws(_=> entry.write(Buffer.alloc(1024)))

  t.equal(actual, expect)
  t.like(entry, { meta: true, type: 'NextFileHasLongLinkpath' })
  t.end()
})

t.test('unknown entry type', t => {
  const h = new Header({
    fieldset: 'xstar',
    path: 'PaxHeader/foo.txt',
    mode: 0o755,
    uid: 24561,
    gid: 20,
    size: 23,
    mtime: new Date('2016-04-01T22:00Z'),
    ctime: new Date('2016-04-01T22:00Z'),
    atime: new Date('2016-04-01T22:00Z'),
    uname: 'isaacs',
    gname: 'staff'
  })
  h.encode()
  h.fieldset.type.write('9', h.block)

  const body = Buffer.alloc(512)
  body.write('not that long, actually')

  const expect = ''
  let actual = ''

  const entry = new ReadEntry(new Header(h.block))

  entry.on('data', c => actual += c)

  entry.write(body.slice(0, 1))
  entry.write(body.slice(1, 25))
  entry.write(body.slice(25))
  t.throws(_=> entry.write(Buffer.alloc(1024)))

  t.equal(actual, expect)
  t.like(entry, { ignore: true })
  t.end()
})
