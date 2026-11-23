const ORDER_STATUS_TEXT = {
  pending: '待支付',
  paid: '已支付',
  cancelled: '已取消'
}

/**
 * 分 -> 元，去掉多余的 .00
 */
function fenToYuan(fen) {
  const value = Number(fen || 0)
  return (value / 100).toFixed(2).replace(/\.00$/, '')
}

function priceText(fen) {
  const value = Number(fen || 0)
  if (value <= 0) return '免费'
  return '¥' + fenToYuan(value)
}

function statusText(status) {
  return ORDER_STATUS_TEXT[status] || status || ''
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatTime(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return ''
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    ' ' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  )
}

module.exports = {
  fenToYuan,
  priceText,
  statusText,
  formatTime
}
