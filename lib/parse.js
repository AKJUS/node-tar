'use strict'
// TODO:
// - set a parallelism level, so that multiple files can be piped out at once
// This will only be ok if they aren't the same file, parent dirs, etc.

// this[BUFFER] is the remainder of a chunk if we're waiting for
// the full 512 bytes of a header to come in.  We will Buffer.concat()
// it to the next write(), which is a mem copy, but a small one.
//
// this[QUEUE] is a Yallist of entries that haven't been emitted
// yet this can only get filled up if the user keeps write()ing after
// a write() returns false, or does a write() with more than one entry
//
// We don't buffer chunks, we always parse them and either create an
// entry, or ignore it, or push it into the active entry.
//
// Shift entry off the buffer when it emits 'end', and emit 'entry' for
// the next one in the list.
//
// At any time, we're pushing body chunks into the entry at buffer.tail,
// and waiting for 'end' on the entry at buffer.head
//
// ignored entries get .resume() called on them straight away


/*
this.entry = the thing that we're writing to.
this.buffer = list of entries waiting to be emitted

on BEGIN
  this.entry = new Entry()
  if entry.meta
    state = META
  else if entry.ignore
    state = IGNORE
  else
    state = BODY
    if buffer.length
      buffer.push(entry)
    else
      entry.on('end', nextEntry)
      emit('entry', entry)

nextEntry
  while buffer.length
    entry = buffer.shift
    emit('entry', entry)
    if !entry.emittedEnd
      entry.on('end', nextEntry)
      return

on BODY
  consume remainder into this.entry
  if complete, this.entry.end(), state = BEGIN

on META
  consume remainder into this.meta
  if complete, this.meta = parseMeta(this.meta), state = BEGIN

on IGNORE
  consume remainder to /dev/null
  if complete, state = BEGIN
*/

const Header = require('./header.js')
const EE = require('events')
const Yallist = require('yallist')
const maxMetaEntrySize = 1024 * 1024
const Entry = require('./read-entry.js')
const Pax = require('./pax.js')
const zlib = require('minizlib')

const gzipHeader = new Buffer([0x1f, 0x8b])
const STATE = Symbol('state')
const WRITEENTRY = Symbol('writeEntry')
const READENTRY = Symbol('readEntry')
const NEXTENTRY = Symbol('nextEntry')
const EX = Symbol('extendedHeader')
const GEX = Symbol('globalExtendedHeader')
const META = Symbol('meta')
const BUFFER = Symbol('buffer')
const QUEUE = Symbol('queue')
const ENDED = Symbol('ended')
const UNZIP = Symbol('unzip')
const CONSUMECHUNK = Symbol('consumeChunk')
module.exports = class Parser extends EE {
  constructor (opt = {}) {
    super()
    if (opt && opt.maxMetaEntrySize)
      this.maxMetaEntrySize = opt.maxMetaEntrySize
    else
      this.maxMetaEntrySize = maxMetaEntrySize
    this[QUEUE] = new Yallist
    this[BUFFER] = null
    this[READENTRY] = null
    this[WRITEENTRY] = null
    this[STATE] = 'begin'
    this[META] = ''
    this[EX] = null
    this[GEX] = null
    this[ENDED] = false
    this[UNZIP] = null
    this.filter = typeof opt.filter === 'function' ? opt.filter : _=>true
  }

  consumeHeader (chunk) {
    const header = new Header(chunk)

    // probably a null block, definitely garbage
    if (!header.cksumValid)
      return this.emit('invalidHeader', header)

    const entry = this[WRITEENTRY] = new Entry(header, this[EX], this[GEX])

    if (entry.meta) {
      if (entry.size > this.maxMetaEntrySize) {
        this.emit('metaEntryTooLarge', entry)
        entry.ignore = true
        this[STATE] = ignore
      } else {
        this[META] = ''
        this[STATE] = 'meta'
      }
      return
    }

    this[EX] = null
    entry.ignore = entry.ignore || !this.filter(entry)
    if (entry.ignore) {
      this.emit('ignoredEntry', entry)
      this[STATE] = entry.remain ? 'ignore' : 'begin'
      return
    }

    if (!entry.size)
      entry.end()
    this[STATE] = entry.remain ? 'body' : 'begin'

    this[QUEUE].push(entry)
    if (!this[READENTRY])
      this[NEXTENTRY]()
  }

  [NEXTENTRY] () {
    while (this[READENTRY] = this[QUEUE].shift()) {
      let entry = this[READENTRY]
      this.emit('entry', entry)
      if (!entry.emittedEnd) {
        entry.on('end', _ => this[NEXTENTRY]())
        break
      }
    }
    if (!this[QUEUE].length)
      this.emit('drain')
  }

  consumeIgnoreBody (chunk) {
    const entry = this[WRITEENTRY]
    if (chunk.length >= entry.blockRemain) {
      this[STATE] = 'begin'
      return chunk.slice(entry.blockRemain)
    } else {
      entry.blockRemain -= chunk.length
      return null
    }
  }

  consumeEntryBody (chunk) {
    return this.consumeBodyChunk(chunk, data => this[WRITEENTRY].write(data))
  }

  // used by consumeMetaBody and consumeEntryBody
  // updates this[WRITEENTRY] and this[STATE]
  consumeBodyChunk (chunk, emit) {
    // Either:
    // 1. chunk does not finish remaining
    // 2. chunk finishes up remaining, but not the _block_ remaining
    // 3. chunk finishes up remaining AND block remaining
    // Note that this means remaining can be 0, but block remaining isn't
    const entry = this[WRITEENTRY]
    if (chunk.length < entry.remain) {
      emit(chunk)
      entry.remain -= chunk.length
      entry.blockRemain -= chunk.length
      return null
    }

    if (chunk.length < entry.blockRemain) {
      // in the middle, finishes body remaining, but not the block
      // will consume entire thing.
      if (entry.remain)
        emit(chunk.slice(0, entry.remain))
      entry.remain = 0
      entry.blockRemain -= chunk.length
      entry.end()
      return null
    }

    // chunk is longer than blockRemain and entryRemain
    emit(chunk.slice(0, entry.remain))
    entry.end()
    this[STATE] = 'begin'
    this[WRITEENTRY] = null
    return chunk.slice(entry.blockRemain)
  }

  consumeMeta (chunk) {
    const entry = this[WRITEENTRY]
    const ret = this.consumeBodyChunk(chunk, data => this[META] += data)
    // if we finished, then the entry is reset
    if (!this[WRITEENTRY]) {
      this.emit('meta', this[META])
      switch (entry.type) {
        case 'ExtendedHeader':
        case 'OldExtendedHeader':
          this[EX] = Pax.parse(this[META], this[EX], false)
          break

        case 'GlobalExtendedHeader':
          this[GEX] = Pax.parse(this[META], this[GEX], true)
          break

        case 'NextFileHasLongPath':
        case 'OldGnuLongPath':
          this[EX] = this[EX] || Object.create(null)
          this[EX].path = this[META]
          break

        case 'NextFileHasLongLinkpath':
          this[EX] = this[EX] || Object.create(null)
          this[EX].linkpath = this[META]
          break

        /* istanbul ignore next */
        default: throw new Error('unknown meta: ' + entry.type)
      }
    }
    return ret
  }

  write (chunk) {
    // first write, might be gzipped
    if (this[UNZIP] === null && chunk) {
      if (this[BUFFER]) {
        chunk = Buffer.concat([this[BUFFER], chunk])
        this[BUFFER] = null
      }
      if (chunk.length < gzipHeader.length) {
        this[BUFFER] = chunk
        return true
      }
      for (let i = 0; this[UNZIP] === null && i < gzipHeader.length; i++) {
        if (chunk[i] !== gzipHeader[i])
          this[UNZIP] = false
      }
      if (this[UNZIP] === null) {
        this[UNZIP] = new zlib.Unzip()
        this[UNZIP].on('data', chunk => this[CONSUMECHUNK](chunk))
      }
    }

    if (this[UNZIP]) {
      if (this[ENDED])
        this[UNZIP].end(chunk)
      else
        this[UNZIP].write(chunk)
    } else
      this[CONSUMECHUNK](chunk)

    // return false if there's a queue, or if the current entry isn't flowing
    const ret = this[STATE] === 'begin' ? true
      : this[STATE] === 'ignore' ? true
      : this[STATE] === 'meta' ? true
      : this[QUEUE].length ? false
      : true

    return ret
  }

  [CONSUMECHUNK] (chunk) {
    if (chunk && this[BUFFER]) {
      chunk = Buffer.concat([this[BUFFER], chunk])
      this[BUFFER] = null
    }

    while (chunk && chunk.length >= 512) {
      switch (this[STATE]) {
        case 'begin':
          // consume the header, create the entry, enter the next state
          this.consumeHeader(chunk.slice(0, 512))
          chunk = chunk.slice(512)
          break

        case 'ignore':
          chunk = this.consumeIgnoreBody(chunk)
          break

        case 'body':
          chunk = this.consumeEntryBody(chunk)
          break

        case 'meta':
          chunk = this.consumeMeta(chunk)
          break

        default:
          throw new Error('invalid state: ' + this[STATE])
      }
    }

    // XXX: this is a writable stream, so 'end' isn't appropriate
    // we ought to emit 'finished', once the last byte has cleared
    // through the last entry.
    if (chunk && chunk.length)
      this[BUFFER] = chunk
    else if (this[ENDED])
      this.emit('end')
  }

  end (chunk) {
    this[ENDED] = true
    this.write(chunk)
  }
}
