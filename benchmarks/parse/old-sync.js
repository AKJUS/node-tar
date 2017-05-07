const Parse = require('tar').Parse
const path = require('path')
const file = process.argv[2] || path.resolve(__dirname, '../npm.tar')
const fs = require('fs')
const data = fs.readFileSync(file)

const start = process.hrtime()
const p = new Parse()
p.on('entry', entry => entry.resume())
p.on('end', _ => {
  const end = process.hrtime(start)
  const ms = Math.round(end[0]*1e6 + end[1]/1e3)/1e3
  const s = Math.round(end[0]*10 + end[1]/1e8)/10
  const ss = s <= 1 ? '' : ' (' + s + 's)'
  console.error('%d%s', ms, ss)
})
p.end(data)
