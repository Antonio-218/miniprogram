const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const orders = db.collection('orders')
const courses = db.collection('courses')
const users = db.collection('users')

const SUB_MCH_ID = process.env.SUB_MCH_ID || ''
// 无商户号时可将 PAY_MOCK 设为 true，用于本地联调（下单后直接标记已支付）
const PAY_MOCK = String(process.env.PAY_MOCK || '') === 'true'
const PAY_CALLBACK_FUNCTION = 'order'

function ok(data) {
  return { code: 0, data: data === undefined ? null : data }
}

function fail(message, code) {
  return { code: code || 1, message: message || '请求失败' }
}

function envId() {
  return process.env.ENV_ID || cloud.getWXContext().ENV
}

function genOrderNo() {
  const d = new Date()
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  const stamp =
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  const random = Math.floor(Math.random() * 1000000)
  return 'K' + stamp + pad(random % 1000) + (random % 1000000)
}

function genNonceStr() {
  return Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12)
}

async function ensureUser(openid) {
  const res = await users.where({ _openid: openid }).limit(1).get()
  if (res.data.length) return res.data[0]
  const doc = {
    _openid: openid,
    nickName: '',
    avatarUrl: '',
    purchased: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }
  const added = await users.add({ data: doc })
  return Object.assign({ _id: added._id }, doc)
}

async function getOrderById(orderId) {
  if (!orderId) return null
  const res = await orders.doc(orderId).get().catch(() => null)
  return res && res.data ? Object.assign({ _id: orderId }, res.data) : null
}

/**
 * 将订单置为已支付，并写入用户已购记录（幂等）
 */
async function markPaid(orderId, extra) {
  const order = await getOrderById(orderId)
  if (!order) return null
  if (order.status === 'paid') return order

  await orders.doc(orderId).update({
    data: Object.assign(
      {
        status: 'paid',
        paidAt: db.serverDate(),
        updatedAt: db.serverDate()
      },
      extra || {}
    )
  })

  const user = await ensureUser(order._openid)
  const purchased = user.purchased || []
  const exists = purchased.some((item) => item.courseId === order.courseId)
  if (!exists) {
    purchased.unshift({
      courseId: order.courseId,
      orderId: orderId,
      createdAt: new Date()
    })
    await users.doc(user._id).update({
      data: { purchased: purchased, updatedAt: db.serverDate() }
    })
    await courses
      .doc(order.courseId)
      .update({ data: { sales: _.inc(1), updatedAt: db.serverDate() } })
      .catch((err) => console.error('[order] update sales failed', err))
  }

  return Object.assign({}, order, { status: 'paid' })
}

async function hasPaidOrder(openid, courseId) {
  const res = await orders.where({ _openid: openid, courseId: courseId, status: 'paid' }).count()
  return res.total > 0
}

/**
 * 调用云开发统一收银台下单，返回 wx.requestPayment 所需参数
 */
async function unifiedOrder(order) {
  if (!SUB_MCH_ID) {
    throw new Error('尚未配置支付商户号，请联系管理员')
  }
  const res = await cloud.cloudPay.unifiedOrder({
    // 商品描述限制 128 字节，中文按 3 字节计算，截断到 24 字符更安全
    body: ('课程-' + (order.courseTitle || '')).slice(0, 24),
    outTradeNo: order.orderNo,
    spbillCreateIp: '127.0.0.1',
    subMchId: SUB_MCH_ID,
    totalFee: order.amount,
    envId: envId(),
    functionName: PAY_CALLBACK_FUNCTION,
    nonceStr: genNonceStr(),
    tradeType: 'JSAPI'
  })

  if (res.returnCode && res.returnCode !== 'SUCCESS') {
    throw new Error(res.returnMsg || '支付下单失败')
  }
  if (res.resultCode && res.resultCode !== 'SUCCESS') {
    throw new Error(res.errCodeDes || '支付下单失败')
  }

  const payment = res.payment || res
  return {
    timeStamp: String(payment.timeStamp || payment.timestamp || ''),
    nonceStr: payment.nonceStr,
    package: payment.package,
    signType: payment.signType || 'MD5',
    paySign: payment.paySign
  }
}

async function createOrder(openid, event) {
  const courseId = event.courseId
  if (!courseId) return fail('缺少课程参数')

  const courseRes = await courses.doc(courseId).get().catch(() => null)
  if (!courseRes || !courseRes.data) return fail('课程不存在或已删除', 404)
  const course = courseRes.data
  if (course.status !== 'on') return fail('课程已下架')

  await ensureUser(openid)

  if (await hasPaidOrder(openid, courseId)) {
    return ok({ paid: true, alreadyPurchased: true })
  }

  const pendingRes = await orders
    .where({ _openid: openid, courseId: courseId, status: 'pending' })
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()

  let order = pendingRes.data[0]
  if (!order) {
    const doc = {
      _openid: openid,
      orderNo: genOrderNo(),
      courseId: courseId,
      courseTitle: course.title || '',
      courseCover: course.cover || '',
      amount: Number(course.price) || 0,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    }
    const added = await orders.add({ data: doc })
    order = Object.assign({ _id: added._id }, doc)
  }

  if (order.amount <= 0) {
    await markPaid(order._id, { paidAt: db.serverDate() })
    return ok({ paid: true, orderId: order._id })
  }

  if (PAY_MOCK) {
    await markPaid(order._id, { mock: true })
    return ok({ paid: true, orderId: order._id })
  }

  const payment = await unifiedOrder(order)
  return ok({ paid: false, orderId: order._id, orderNo: order.orderNo, amount: order.amount, payment })
}

async function payOrder(openid, event) {
  const order = await getOrderById(event.orderId)
  if (!order) return fail('订单不存在', 404)
  if (order._openid !== openid) return fail('无权操作该订单', 403)
  if (order.status === 'paid') return ok({ paid: true })
  if (order.status === 'cancelled') {
    return fail('订单已取消，请重新下单')
  }
  if (order.amount <= 0 || PAY_MOCK) {
    await markPaid(order._id)
    return ok({ paid: true })
  }
  const payment = await unifiedOrder(order)
  return ok({ paid: false, orderId: order._id, payment })
}

async function confirmOrder(openid, event) {
  const order = await getOrderById(event.orderId)
  if (!order) return fail('订单不存在', 404)
  if (order._openid !== openid) return fail('无权操作该订单', 403)
  if (order.status === 'paid') return ok({ paid: true })
  if (!SUB_MCH_ID || PAY_MOCK) {
    return ok({ paid: false, state: 'PENDING' })
  }

  try {
    const res = await cloud.cloudPay.queryOrder({
      subMchId: SUB_MCH_ID,
      outTradeNo: order.orderNo,
      nonceStr: genNonceStr(),
      envId: envId()
    })
    const state = res.tradeState || res.trade_state
    if (state === 'SUCCESS') {
      await markPaid(order._id, { transactionId: res.transactionId || '' })
      return ok({ paid: true })
    }
    return ok({ paid: false, state: state || '' })
  } catch (err) {
    console.error('[order] queryOrder failed', err)
    return ok({ paid: false, state: '' })
  }
}

async function listOrders(openid, event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(20, Math.max(1, Number(event.pageSize) || 10))
  const where = { _openid: openid }
  if (event.status) where.status = event.status

  const res = await orders
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()

  return ok({
    list: res.data,
    page,
    pageSize,
    hasMore: res.data.length === pageSize
  })
}

async function cancelOrder(openid, event) {
  const order = await getOrderById(event.orderId)
  if (!order) return fail('订单不存在', 404)
  if (order._openid !== openid) return fail('无权操作该订单', 403)
  if (order.status !== 'pending') return fail('当前订单状态不可取消')
  await orders.doc(order._id).update({
    data: { status: 'cancelled', updatedAt: db.serverDate() }
  })
  return ok({ success: true })
}

/**
 * 微信支付结果回调（cloudPay.unifiedOrder 的 functionName）
 */
async function handleNotify(event) {
  const orderNo = event.outTradeNo
  if (!orderNo) return { errcode: 0, errmsg: 'no outTradeNo' }

  const res = await orders.where({ orderNo: orderNo }).limit(1).get()
  const order = res.data[0]
  if (!order) return { errcode: 0, errmsg: 'order not found' }

  if (event.returnCode === 'SUCCESS' && (!event.resultCode || event.resultCode === 'SUCCESS')) {
    await markPaid(order._id, { transactionId: event.transactionId || '' })
  }
  return { errcode: 0, errmsg: 'ok' }
}

exports.main = async (event) => {
  const data = event || {}

  // 支付回调：由微信支付触发，携带 returnCode / outTradeNo
  if (data.returnCode && data.outTradeNo) {
    try {
      return await handleNotify(data)
    } catch (err) {
      console.error('[order] notify failed', err)
      return { errcode: 0, errmsg: 'notify failed' }
    }
  }

  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail('无法获取用户身份，请重试', 401)

  const action = data.action || 'list'
  try {
    if (action === 'create') return await createOrder(OPENID, data)
    if (action === 'pay') return await payOrder(OPENID, data)
    if (action === 'confirm') return await confirmOrder(OPENID, data)
    if (action === 'list') return await listOrders(OPENID, data)
    if (action === 'cancel') return await cancelOrder(OPENID, data)
    return fail('未知操作', 404)
  } catch (err) {
    console.error('[order]', action, err)
    return fail(err.message || '服务异常', 500)
  }
}
