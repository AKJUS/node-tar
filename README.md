# node-tar

Tar for Node.js.

Designed to mimic the behavior of `tar(1)` on unix systems.  If you
are familiar with how tar works, most of this will hopefully be
straightforward for you.  If not, then hopefully this module can teach
you useful unix skills that may come in handy someday :)

## Background

A "tar file" or "tarball" is an archive of file system entries
(directories, files, links, etc.)  The name comes from "tape archive".
If you run `man tar` on almost any Unix command line, you'll learn
quite a bit about what it can do, and its history.

Tar has 5 main top-level commands:

* `c` Create an archive
* `r` Replace entries within an archive
* `u` Update entries within an archive (ie, replace if they're newer)
* `t` List out the contents of an archive
* `x` Extract an archive to disk

The other flags and options modify how this top level function works.

## High-Level API

These 5 functions are the high-level API.  All of them have a
single-character name (for unix nerds familiar with `tar(1)` as well
as a long name (for everyone else).

All the high-level functions take the following arguments, all three
of which are optional and may be omitted.

1. `options` - An optional object specifying various options
2. `paths` - An array of paths to add or extract
3. `callback` - Called when the command is completed, if async.  (If
   sync, providing a callback throws a `TypeError`.)

If the command is sync (ie, if `options.sync=true`), then the
callback is not allowed, and the action will be completed immediately.

If a `file` argument is specified, and the command is async, then a
`Promise` is returned.

If a `file` option is not specified, then a stream is returned.  For
`create`, this is a readable stream of the generated archive.  For
`list` and `extract` this is a writable stream that an archive should
be written into.

(`replace` and `update` only work on existing archives, and so require
a `file` argument.)

Sync commands return a stream that acts on its input immediately in
the same tick.  For readable streams, this means that all of the data
is immediately available by calling `stream.read()`.  For writable
streams, it will be acted upon as soon as it is provided, but this can
be at any time.

### tar.c(options, fileList, callback) [alias: tar.create]

Create a tarball archive.

The `fileList` is an array of paths to add to the tarball.  Adding a
directory also adds its children recursively.

The following options are supported:

- `file` Write the tarball archive to the specified filename.  If this
  is specified, then the callback will be fired when the file has been
  written, and a promise will be returned that resolves when the file
  is written.  If a filename is not specified, then a Readable Stream
  will be returned which will emit the file data. [Alias: `f`]
- `sync` Act synchronously.  If this is set, then any provided file
  will be fully written after the call to `tar.c`.  If this is set,
  and a file is not provided, then the resulting stream will already
  have the data ready to `read` or `emit('data')` as soon as you
  request it.
- `onwarn` A function that will get called with `(message, data)` for
  any warnings encountered.
- `strict` Treat warnings as crash-worthy errors.  Default false.
- `cwd` The current working directory for creating the archive.
- `prefix` A path portion to prefix onto the entries in the archive.
- `gzip` Set to any truthy value to create a gzipped archive, or an
  object with settings for `zlib.Gzip()` [Alias: `z`]
- `filter` A function that gets called with `(path, stat)` for each
  entry being added.  Return `true` to add the entry to the archive,
  or `false` to omit it.
- `portable` Omit metadata that is system-specific: `ctime`, `atime`,
  `uid`, `gid`, `uname`, `gname`, `dev`, `ino`, and `nlink`.  Note
  that `mtime` is still included, because this is necessary other
  time-based operations.
- `preservePaths` Allow absolute paths and paths containing `..`.  By
  default, `/` is stripped from absolute paths, `..` paths are not
  added to the archive. [Alias: `P`]

The following options are mostly internal, but can be modified in some
advanced use cases, such as re-using caches between runs.

- `linkCache` A Map object containing the device and inode value for
  any file whose nlink is > 1, to identify hard links.
- `statCache` A Map object that caches calls `lstat`.
- `readdirCache` A Map object that caches calls to `readdir`.
- `jobs` A number specifying how many concurrent jobs to run.
  Defaults to 4.
- `maxReadSize` The maximum buffer size for `fs.read()` operations.
  Defaults to 1 MB.

### tar.x(options, fileList, callback) [alias: tar.extract]

Extract a tarball archive.

The `fileList` is an array of paths to extract from the tarball.  If
no paths are provided, then all the entries are extracted.

If the archive is gzipped, then tar will detect this and unzip it.

The following options are supported:

- `cwd` Extract files relative to the specified directory.  Defaults
  to `process.cwd()`. [Alias: `C`]
- `file` The archive file to extract.  If not specified, then a
  Writable stream is returned where the archive data should be
  written. [Alias: `f`]
- `sync` Create files and directories synchronously.
- `strict` Treat warnings as crash-worthy errors.  Default false.
- `filter` A function that gets called with `(path, entry)` for each
  entry being unpacked.  Return `true` to unpack the entry from the
  archive, or `false` to skip it.
- `newer` Set to true to keep the existing file on disk if it's newer
  than the file in the archive.
- `preservePaths` Allow absolute paths, paths containing `..`, and
  extracting through symbolic links.  By default, `/` is stripped from
  absolute paths, `..` paths are not extracted, and any file whose
  location would be modified by a symbolic link is not extracted.
  [Alias: `P`]
- `unlink` Unlink files before creating them.  Without this option,
  tar overwrites existing files, which preserves existing hardlinks.
  With this option, existing hardlinks will be broken, as will any
  symlink that would affect the location of an extracted file. [Alias:
  `U`]
- `strip` Remove the specified number of leading path elements.
  Pathnames with fewer elements will be silently skipped.  Note that
  the pathname is edited after applying the filter, but before
  security checks. [Alias: `strip-components`, `stripComponents`]
- `onwarn` A function that will get called with `(message, data)` for
  any warnings encountered.

The following options are mostly internal, but can be modified in some
advanced use cases, such as re-using caches between runs.

- `umask` Filter the modes of entries like `process.umask()`.
- `dmode` Default mode for directories
- `fmode` Default mode for files
- `dirCache` A Map object of which directories exist.
- `maxMetaEntrySize` The maximum size of meta entries that is
  supported.  Defaults to 1 MB.

### tar.t(options, fileList, callback) [alias: tar.list]

List the contents of a tarball archive.

The `fileList` is an array of paths to list from the tarball.  If
no paths are provided, then all the entries are listed.

If the archive is gzipped, then tar will detect this and unzip it.

Returns an event emitter that emits `entry` events with
`tar.ReadEntry` objects.  However, they don't emit `'data'` or `'end'`
events.  (If you want to get actual readable entries, use the
`tar.Parse` class instead.)

The following options are supported:

- `cwd` Extract files relative to the specified directory.  Defaults
  to `process.cwd()`. [Alias: `C`]
- `file` The archive file to list.  If not specified, then a
  Writable stream is returned where the archive data should be
  written. [Alias: `f`]
- `sync` Read the specified file synchronously.  (This has no effect
  when a file option isn't specified, because entries are emitted as
  fast as they are parsed from the stream anyway.)
- `strict` Treat warnings as crash-worthy errors.  Default false.
- `filter` A function that gets called with `(path, entry)` for each
  entry being listed.  Return `true` to emit the entry from the
  archive, or `false` to skip it.

### tar.u(options, fileList, callback) [alias: tar.update]

Add files to an archive if they are newer than the entry already in
the tarball archive.

The `fileList` is an array of paths to add to the tarball.  Adding a
directory also adds its children recursively.

The following options are supported:

- `file` Required. Write the tarball archive to the specified
  filename. [Alias: `f`]
- `sync` Act synchronously.  If this is set, then any provided file
  will be fully written after the call to `tar.c`.
- `onwarn` A function that will get called with `(message, data)` for
  any warnings encountered.
- `strict` Treat warnings as crash-worthy errors.  Default false.
- `cwd` The current working directory for adding entries to the
  archive. [Alias: `C`]
- `prefix` A path portion to prefix onto the entries in the archive.
- `gzip` Set to any truthy value to create a gzipped archive, or an
  object with settings for `zlib.Gzip()` [Alias: `z`]
- `filter` A function that gets called with `(path, stat)` for each
  entry being added.  Return `true` to add the entry to the archive,
  or `false` to omit it.
- `portable` Omit metadata that is system-specific: `ctime`, `atime`,
  `uid`, `gid`, `uname`, `gname`, `dev`, `ino`, and `nlink`.  Note
  that `mtime` is still included, because this is necessary other
  time-based operations.
- `preservePaths` Allow absolute paths and paths containing `..`.  By
  default, `/` is stripped from absolute paths, `..` paths are not
  added to the archive. [Alias: `P`]

### tar.r(options, fileList, callback) [alias: tar.replace]

Add files to an existing archive.  Because later entries override
earlier entries, this effectively replaces any existing entries.

The `fileList` is an array of paths to add to the tarball.  Adding a
directory also adds its children recursively.

The following options are supported:

- `file` Required. Write the tarball archive to the specified
  filename. [Alias: `f`]
- `sync` Act synchronously.  If this is set, then any provided file
  will be fully written after the call to `tar.c`.
- `onwarn` A function that will get called with `(message, data)` for
  any warnings encountered.
- `strict` Treat warnings as crash-worthy errors.  Default false.
- `cwd` The current working directory for adding entries to the
  archive. [Alias: `C`]
- `prefix` A path portion to prefix onto the entries in the archive.
- `gzip` Set to any truthy value to create a gzipped archive, or an
  object with settings for `zlib.Gzip()` [Alias: `z`]
- `filter` A function that gets called with `(path, stat)` for each
  entry being added.  Return `true` to add the entry to the archive,
  or `false` to omit it.
- `portable` Omit metadata that is system-specific: `ctime`, `atime`,
  `uid`, `gid`, `uname`, `gname`, `dev`, `ino`, and `nlink`.  Note
  that `mtime` is still included, because this is necessary other
  time-based operations.
- `preservePaths` Allow absolute paths and paths containing `..`.  By
  default, `/` is stripped from absolute paths, `..` paths are not
  added to the archive. [Alias: `P`]

## Low-Level API

### class tar.Pack

A readable tar stream.

Has all the standard readable stream interface stuff.  `'data'` and
`'end'` events, `read()` method, `pause()` and `resume()`, etc.

#### constructor(options)

The following options are supported:

- `onwarn` A function that will get called with `(message, data)` for
  any warnings encountered.
- `strict` Treat warnings as crash-worthy errors.  Default false.
- `cwd` The current working directory for creating the archive.
- `prefix` A path portion to prefix onto the entries in the archive.
- `gzip` Set to any truthy value to create a gzipped archive, or an
  object with settings for `zlib.Gzip()`
- `filter` A function that gets called with `(path, stat)` for each
  entry being added.  Return `true` to add the entry to the archive,
  or `false` to omit it.
- `portable` Omit metadata that is system-specific: `ctime`, `atime`,
  `uid`, `gid`, `uname`, `gname`, `dev`, `ino`, and `nlink`.  Note
  that `mtime` is still included, because this is necessary other
  time-based operations.
- `preservePaths` Allow absolute paths and paths containing `..`.  By
  default, `/` is stripped from absolute paths, `..` paths are not
  added to the archive.
- `linkCache` A Map object containing the device and inode value for
  any file whose nlink is > 1, to identify hard links.
- `statCache` A Map object that caches calls `lstat`.
- `readdirCache` A Map object that caches calls to `readdir`.
- `jobs` A number specifying how many concurrent jobs to run.
  Defaults to 4.
- `maxReadSize` The maximum buffer size for `fs.read()` operations.
  Defaults to 1 MB.


#### addEntry(path) -> this

Adds an entry to the archive.  Returns the Pack stream.

#### write(path) -> Boolean

Adds an entry to the archive.  Returns true if flushed.

#### end() -> this

Finishes the archive.

### class tar.Pack.Sync

Synchronous version of `tar.Pack`.

### class tar.Unpack

A writable stream that unpacks a tar archive onto the file system.

All the normal writable stream stuff is supported.  `write()` and
`end()` methods, `'drain'` events, etc.

`'close'` is emitted when it's done writing stuff to the file system.

#### constructor(options)

- `cwd` Extract files relative to the specified directory.  Defaults
  to `process.cwd()`.
- `filter` A function that gets called with `(path, entry)` for each
  entry being unpacked.  Return `true` to unpack the entry from the
  archive, or `false` to skip it.
- `newer` Set to true to keep the existing file on disk if it's newer
  than the file in the archive.
- `preservePaths` Allow absolute paths, paths containing `..`, and
  extracting through symbolic links.  By default, `/` is stripped from
  absolute paths, `..` paths are not extracted, and any file whose
  location would be modified by a symbolic link is not extracted.
- `unlink` Unlink files before creating them.  Without this option,
  tar overwrites existing files, which preserves existing hardlinks.
  With this option, existing hardlinks will be broken, as will any
  symlink that would affect the location of an extracted file.
- `strip` Remove the specified number of leading path elements.
  Pathnames with fewer elements will be silently skipped.  Note that
  the pathname is edited after applying the filter, but before
  security checks.
- `onwarn` A function that will get called with `(message, data)` for
  any warnings encountered.
- `umask` Filter the modes of entries like `process.umask()`.
- `dmode` Default mode for directories
- `fmode` Default mode for files
- `dirCache` A Map object of which directories exist.
- `maxMetaEntrySize` The maximum size of meta entries that is
  supported.  Defaults to 1 MB.

### class tar.Unpack.Sync

Synchronous version of `tar.Unpack`.

### class tar.Parse

A writable stream that parses a tar archive stream.  All the standard
writable stream stuff is supported.

If the archive is gzipped, then tar will detect this and unzip it.

Emits `'entry'` events with `tar.ReadEntry` objects, which are
themselves readable streams that you can pipe wherever.

Each `entry` will not emit until the one before it is flushed through,
so make sure to either consume the data (with `on('data', ...)` or
`.pipe(...)`) or throw it away with `.resume()` to keep the stream
flowing.

#### constructor(options)

Returns an event emitter that emits `entry` events with
`tar.ReadEntry` objects.

The following options are supported:

- `cwd` Extract files relative to the specified directory.  Defaults
  to `process.cwd()`.
- `strict` Treat warnings as crash-worthy errors.  Default false.
- `filter` A function that gets called with `(path, entry)` for each
  entry being listed.  Return `true` to emit the entry from the
  archive, or `false` to skip it.

### class tar.ReadEntry extends [MiniPass](http://npm.im/minipass)

A representation of an entry that is being read out of a tar archive.

It has the following fields:

- `extended` The extended metadata object provided to the constructor.
- `globalExtended` The global extended metadata object provided to the
  constructor.
- `remain` The number of bytes remaining to be written into the
  stream.
- `blockRemain` The number of 512-byte blocks remaining to be written
  into the stream.
- `ignore` Whether this entry should be ignored.
- `meta` True if this represents metadata about the next entry, false
  if it represents a filesystem object.
- All the fields from the header, extended header, and global extended
  header are added to the ReadEntry object.  So it has `path`, `type`,
  `size, `mode`, and so on.

#### constructor(header, extended, globalExtended)

Create a new ReadEntry object with the specified header, extended
header, and global extended header values.

### class tar.WriteEntry extends [MiniPass](http://npm.im/minipass)

A representation of an entry that is being written from the file
system into a tar archive.

Emits data for the Header, and for the Pax Extended Header if one is
required, as well as any body data.

Creating a WriteEntry for a directory does not also create
WriteEntry objects for all of the directory contents.

It has the following fields:

- `path` The path field that will be written to the archive.  By
  default, this is also the path from the cwd to the file system
  object.
- `portable` Omit metadata that is system-specific: `ctime`, `atime`,
  `uid`, `gid`, `uname`, `gname`, `dev`, `ino`, and `nlink`.  Note
  that `mtime` is still included, because this is necessary other
  time-based operations.
- `myuid` If supported, the uid of the user running the current
  process.
- `myuser` The `env.USER` string if set, or `''`.  Set as the entry
  `uname` field if the file's `uid` matches `this.myuid`.
- `maxReadSize` The maximum buffer size for `fs.read()` operations.
  Defaults to 1 MB.
- `linkCache` A Map object containing the device and inode value for
  any file whose nlink is > 1, to identify hard links.
- `statCache` A Map object that caches calls `lstat`.
- `preservePaths` Allow absolute paths and paths containing `..`.  By
  default, `/` is stripped from absolute paths, `..` paths are not
  added to the archive.
- `cwd` The current working directory for creating the archive.
  Defaults to `process.cwd()`.
- `absolute` The absolute path to the entry on the filesystem.  By
  default, this is `path.resolve(this.cwd, this.path)`, but it can be
  overridden explicitly.
- `strict` Treat warnings as crash-worthy errors.  Default false.
- `win32` True if on a windows platform.  Causes behavior where paths
  replace `\` with `/`.

#### constructor(path, options)

`path` is the path of the entry as it is written in the archive.

The following options are supported:

- `portable` Omit metadata that is system-specific: `ctime`, `atime`,
  `uid`, `gid`, `uname`, `gname`, `dev`, `ino`, and `nlink`.  Note
  that `mtime` is still included, because this is necessary other
  time-based operations.
- `maxReadSize` The maximum buffer size for `fs.read()` operations.
  Defaults to 1 MB.
- `linkCache` A Map object containing the device and inode value for
  any file whose nlink is > 1, to identify hard links.
- `statCache` A Map object that caches calls `lstat`.
- `preservePaths` Allow absolute paths and paths containing `..`.  By
  default, `/` is stripped from absolute paths, `..` paths are not
  added to the archive.
- `cwd` The current working directory for creating the archive.
  Defaults to `process.cwd()`.
- `absolute` The absolute path to the entry on the filesystem.  By
  default, this is `path.resolve(this.cwd, this.path)`, but it can be
  overridden explicitly.
- `strict` Treat warnings as crash-worthy errors.  Default false.
- `win32` True if on a windows platform.  Causes behavior where paths
  replace `\` with `/`.
- `onwarn` A function that will get called with `(message, data)` for
  any warnings encountered.

#### warn(message, data)

If strict, emit an error with the provided message.

Othewise, emit a `'warn'` event with the provided message and data.

### class tar.WriteEntry.Sync

Synchronous version of tar.WriteEntry

### class tar.Header

A class for reading and writing header blocks.

It has the following fields:

- `nullBlock` True if decoding a block which is entirely composed of
  `0x00` null bytes.  (Useful because tar files are terminated by
  at least 2 null blocks.)
- `fieldset` Getter/setter for the set of fields used in encoding and
  decoding this header.  As a setter, accepts one of the following
  values: `'xstar'`, `'ustar'`, `'basic'`.  As a getter, returns the
  actual set of fields in use.
- `block` The 512-byte block which is the encoded tar Header.
- `cksumValid` True if the checksum in the header is valid, false
  otherwise.
- `needPax` True if the values, as encoded, will require a Pax
  extended header.
- `path` Joined with a `/` character to the `ustarPrefix` or
  `xstarPrefix` if using the `ustar` or `xstar` formats, respectively.
  The path of the entry.
- `mode` The 4 lowest-order octal digits of the file mode.  That is,
  read/write/execute permissions for world, group, and owner, and the
  setuid, setgid, and sticky bits.
- `uid` Numeric user id of the file owner
- `gid` Numeric group id of the file owner
- `size` Size of the file in bytes
- `mtime` Modified time of the file
- `cksum` The checksum of the header.  This is generated by adding all
  the bytes of the header block, treating the checksum field itself as
  all ascii space characters (that is, `0x20`).
- `type` The human-readable name of the type of entry this represents,
  or the alphanumeric key if unknown.
- `typeKey` The alphanumeric key for the type of entry this header
  represents.
- `linkpath` The target of Link and SymbolicLink entries.
- `ustar` Set to the string `'ustar'` for ustar and xstar fieldsets.
- `ustarver` Set to the string `'00'` for ustar and xstar fieldsets.
- `uname` Human-readable user name of the file owner
- `gname` Human-readable group name of the file owner
- `devmaj` The major portion of the device number.  Always `0` for
  files, directories, and links.
- `devmin` The minor portion of the device number.  Always `0` for
  files, directories, and links.
- `ustarPrefix` If using the `ustar` format, then this is 155
  characters that are joined with the `path` portion with a `/`
  character to extend the limit of paths it can hold.
- `xstarPrefix` Just like `ustarPrefix`, but only 130 characters, used
  with the `xstar` format.
- `prefixTerminator` A null `\0` value when using the `xstar` format
- `atime` File access time.  Only available in the `xstar` format
- `ctime` File change time.  Only available in the `xstar` format

#### constructor(data)

`data` is optional.  It is either a 512-byte Buffer that should be
interpreted as a tar Header, or a data object of keys and values to
set on the header object, and eventually encode as a tar Header.

When decoding a block, the fieldset will be automatically detected.
When encoding, if not explicitly chosen, it will be selected based on
the needs of the data being encoded.

#### decode(block)

Decode the provided buffer.

Buffer length must be greater than 512 bytes.

#### set(data)

Set the fields in the data object.

#### encode(block)

Encode the header fields using the appropriate fieldset.

If block is unset, then create a new 512-byte buffer.

Returns `this.needPax` to indicate whether a Pax Extended Header is
required to properly encode the specified data.

### class tar.Pax

An object representing a set of key-value pairs in an Pax extended
header entry.

It has the following fields.  Where the same name is used, they have
the same semantics as the tar.Header field of the same name.

- `global` True if this represents a global extended header, or false
  if it is for a single entry.
- `atime`
- `charset`
- `comment`
- `ctime`
- `gid`
- `gname`
- `linkpath`
- `mtime`
- `path`
- `size`
- `uid`
- `uname`
- `dev`
- `ino`
- `nlink`

#### constructor(object, global)

Set the fields set in the object.  `global` is a boolean that defaults
to false.

#### encode()

Return a Buffer containing the header and body for the Pax extended
header entry, or `null` if there is nothing to encode.

#### encodeBody()

Return a string representing the body of the pax extended header
entry.

#### encodeField(fieldName)

Return a string representing the key/value encoding for the specified
fieldName, or `''` if the field is unset.

### tar.Pax.parse(string, extended, global)

Return a new Pax object created by parsing the contents of the string
provided.

If the `extended` object is set, then also add the fields from that
object.  (This is necessary because multiple metadata entries can
occur in sequence.)

### class tar.Field

A representation of a field definition that occurs in a tar header.

It has the following fields:

- `offset` The offset from the start of the header
- `size` The number of bytes for this field
- `end` The end of the field (that is, `offset` plus `size`)
- `type` Either `'string'`, `'date'`, or `'number'` as appropriate

#### constructor(offset, size, type)

Sets the specified values.  (`end` is inferred.)

#### readRaw(buffer)

Get the raw bytes for this field as a Buffer slice.

#### read(buffer)

Read the value out of the provided buffer.  Coerces to the appropriate
type.

#### write(value, buffer)

Write the specified value into the provided buffer at the appropriate
offset.

Returns `true` if the value could not be completely encoded and thus a
Pax extended header should be used.

### tar.types

A translation table for the `type` field in tar headers.

#### tar.types.name.get(code)

Get the human-readable name for a given alphanumeric code.

#### tar.types.code.get(name)

Get the alphanumeric code for a given human-readable name.
