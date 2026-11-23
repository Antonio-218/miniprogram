/**
 * 调起微信支付
 * payment 由云函数 cloudPay.unifiedOrder 返回
 */
function requestPayment(payment) {
  if (!payment || !payment.paySign || !payment.package) {
    return Promise.reject(new Error('支付参数缺失，请检查支付配置'))
  }
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: String(payment.timeStamp || ''),
      nonceStr: payment.nonceStr,
      package: payment.package,
      signType: payment.signType || 'MD5',
      paySign: payment.paySign,
      success: resolve,
      fail: reject
    })
  })
}

function isCancel(err) {
  const msg = (err && (err.errMsg || err.message)) || ''
  return msg.indexOf('cancel') > -1
}

module.exports = { requestPayment, isCancel }
