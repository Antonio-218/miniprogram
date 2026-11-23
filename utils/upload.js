/**
 * 上传文件到云存储，返回 fileID
 * @param {string} filePath 本地临时文件路径
 * @param {string} dir 云存储目录，如 covers / videos / avatars
 */
function uploadFile(filePath, dir) {
  const matched = /\.(\w+)(?:\?|$)/.exec(filePath || '')
  const ext = matched ? matched[1] : 'png'
  const cloudPath = dir + '/' + Date.now() + '-' + Math.floor(Math.random() * 1000000) + '.' + ext
  return wx.cloud.uploadFile({ cloudPath, filePath }).then((res) => res.fileID)
}

module.exports = { uploadFile }
