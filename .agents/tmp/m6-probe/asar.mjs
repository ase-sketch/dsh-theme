import fs from 'node:fs'

export function readHeader(asarPath) {
  const fd = fs.openSync(asarPath, 'r')
  const sizeBuf = Buffer.alloc(8)
  fs.readSync(fd, sizeBuf, 0, 8, null)
  const size = sizeBuf.readUInt32LE(4)
  const headerBuf = Buffer.alloc(size)
  fs.readSync(fd, headerBuf, 0, size, null)
  const strLen = headerBuf.readUInt32LE(0)
  const json = headerBuf.toString('utf8', 4, 4 + strLen)
  return { fd, header: JSON.parse(json), base: 8 + size }
}

export function statFile(asarPath, rel) {
  const { fd, header, base } = readHeader(asarPath)
  const parts = rel.split('/').filter(Boolean)
  let node = header
  for (const p of parts) {
    if (!node.files || !node.files[p]) { fs.closeSync(fd); return null }
    node = node.files[p]
  }
  fs.closeSync(fd)
  return { node, base }
}

export function readFile(asarPath, rel) {
  const r = statFile(asarPath, rel)
  if (!r || r.node.files) return null
  const fd = fs.openSync(asarPath, 'r')
  const buf = Buffer.alloc(r.node.size)
  fs.readSync(fd, buf, 0, r.node.size, r.base + Number(r.node.offset))
  fs.closeSync(fd)
  return buf
}
