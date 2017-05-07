const tar = require('tar-stream')
const path = require('path')
const file = process.argv[2] || path.resolve(__dirname, '../npm.tar')
const fs = require('fs')

const start = process.hrtime()
const p = tar.extract()
p.on('entry', (entry, stream, callback) => {
  stream.on('end', callback)
  stream.resume()
})
p.on('finish', _ => {
  const end = process.hrtime(start)
  const ms = Math.round(end[0]*1e6 + end[1]/1e3)/1e3
  const s = Math.round(end[0]*10 + end[1]/1e8)/10
  const ss = s <= 1 ? '' : ' (' + s + 's)'
  console.error('%d%s', ms, ss)
})
fs.createReadStream(file).pipe(p)
