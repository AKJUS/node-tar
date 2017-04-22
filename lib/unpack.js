'use strict'
// TODO:
// - file/dir ownership setting based on what's in the file.

const EE = require('events').EventEmitter
const Parser = require('./parse.js')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')

// only make dirs once.
const madeDirs = Object.create(null)
const mkdir = (path, mode, cb) => {
  if (madeDirs[path] === true)
    return cb()
  if (Array.isArray(madeDirs[path]))
    return madeDirs[path].push(cb)
  madeDirs[path] = [cb]
  mkdirp(path, mode, er => {
    const cbs = madeDirs[path]
    if (er)
      delete madeDirs[path]
    else
      madeDirs[path] = true
    cbs.forEach(fn => fn(er))
  })
}
const mkdirSync = (path, mode) => {
  if (madeDirs[path] === true)
    return
  mkdirp.sync(path, mode)
  const cbs = madeDirs[path]
  madeDirs[path] = true
  if (Array.isArray(cbs))
    madeDirs[path].push(cb).forEach(fn => fn())
}

const ONENTRY = Symbol('onEntry')
const FILE = Symbol('file')
const DIRECTORY = Symbol('directory')
const LINK = Symbol('link')
const SYMLINK = Symbol('symlink')
const HARDLINK = Symbol('hardlink')
const UNSUPPORTED = Symbol('unsupported')
const UNKNOWN = Symbol('unknown')
const FIXPATH = Symbol('fixPath')
const MKPARENT = Symbol('mkparent')

class Unpack extends Parser {
  constructor (options) {
    super(options)
    if (typeof options === 'string')
      options = { path: options }
    else if (!options || typeof options.path !== 'string')
      throw new TypeError('must specify a target path')

    // XXX opt.strip belongs in Parser
    this.strip = +options.strip || 0
    this.path = options.path
    const umask = process.umask()
    // default mode for dirs created as parents
    this.dmode = options.dmode || (0o777 ^ umask)

    this.on('entry', entry => this[ONENTRY](entry))
  }

  [ONENTRY] (entry) {
    switch (entry.type) {
      case 'File':
      case 'OldFile':
      case 'ContiguousFile':
        return this[FILE](entry)

      case 'Link':
        return this[HARDLINK](entry)

      case 'SymbolicLink':
        return this[SYMLINK](entry)

      case 'Directory':
      case 'GNUDumpDir':
        return this[DIRECTORY](entry)

      case 'CharacterDevice':
      case 'BlockDevice':
      case 'FIFO':
        return this[UNSUPPORTED](entry)

      default:
        return this[UNKNOWN](entry)
    }
  }

  [FIXPATH] (p) {
    if (this.strip)
      p = p.split('/').slice(this.strip).join('/')
    return path.join(this.path, path.join('/', p))
  }

  [MKPARENT] (entry, cb) {
    const p = this[FIXPATH](entry.path)
    const dirname = path.dirname(p)
    mkdir(dirname, this.dmode, er => {
      if (er)
        return this.emit('error', er)
      cb()
    })
  }

  [FILE] (entry) {
    this[MKPARENT](entry, _ => {
      const target = this[FIXPATH](entry.path)
      const mode = entry.mode | 0o777
      entry.pipe(fs.createWriteStream(target, { mode: entry.mode }))
        .on('close', _ => {
          if (entry.atime && entry.mtime)
            fs.utimes(target, entry.atime, entry.mtime, _ => _)
        })
    })
  }

  [DIRECTORY] (entry) {
    const mode = entry.mode | 0o777
    const target = this[FIXPATH](entry.path)
    mkdir(target, mode, er => {
      if (er)
        return this.emit('error', er)
      if (entry.atime && entry.mtime)
        fs.utimes(target, entry.atime, entry.mtime, _ => _)
      entry.resume()
    })
  }

  [UNSUPPORTED] (entry) {
    this.emit('unsupported', entry)
    entry.resume()
  }

  [UNKNOWN] (entry) {
    this.emit('unknown', entry)
    entry.resume()
  }

  [SYMLINK] (entry) {
    this[LINK](entry, entry.linkpath, SYMLINK, 'symlink')
  }

  [HARDLINK] (entry) {
    this[LINK](entry, this[FIXPATH](entry.linkpath), HARDLINK, 'link')
  }

  [LINK] (entry, linkpath, retry, link) {
    const path = this[FIXPATH](entry.path)
    // should probably be allowed by default, locked down with an option.
    // XXX: get the type ('file' or 'dir') for windows
    this[MKPARENT](entry, _ => {
      fs[link](linkpath, path, er => {
        // if it's an EEXIST, then clobber
        if (er && er.code === 'EEXIST')
          return fs.unlink(path, er => {
            if (er)
              this.emit('error', er)
            this[retry](entry)
          })
        if (er)
          return this.emit('error', er)
        entry.resume()
      })
    })
  }
}

class UnpackSync extends Unpack {
  constructor (options) {
    super(options)
  }

  [FILE] (entry) {
    this[MKPARENT](entry)
    const target = this[FIXPATH](entry.path)
    const mode = entry.mode | 0o777
    const fd = fs.openSync(target, 'w', mode)
    entry.on('data', buf => fs.writeSync(fd, buf))
    entry.on('end', _ => {
      if (entry.atime && entry.mtime)
        fs.futimesSync(fd, entry.atime, entry.mtime)
      fs.closeSync(fd)
    })
  }

  [DIRECTORY] (entry) {
    const mode = entry.mode | 0o777
    const target = this[FIXPATH](entry.path)
    mkdirSync(target, mode)
    if (entry.atime && entry.mtime)
      fs.utimesSync(target, entry.atime, entry.mtime, _ => _)
    entry.resume()
  }

  [MKPARENT] (entry) {
    const p = this[FIXPATH](entry.path)
    const dirname = path.dirname(p)
    mkdirSync(dirname, this.dmode)
  }

  [LINK] (entry, linkpath, retry, link) {
    const path = this[FIXPATH](entry.path)
    // should probably be allowed by default, locked down with an option.
    // XXX: get the type ('file' or 'dir') for windows
    this[MKPARENT](entry)
    try {
      fs[link + 'Sync'](linkpath, path)
    } catch (er) {
      // if it's an EEXIST, then clobber
      if (er.code === 'EEXIST') {
        fs.unlinkSync(path)
        return this[retry](entry)
      }
      throw er
    }
    entry.resume()
  }
}

Unpack.Sync = UnpackSync
module.exports = Unpack
