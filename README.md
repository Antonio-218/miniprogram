# 云课 · 在线卖课（知识付费）小程序

原生微信小程序 + 微信云开发（云函数 / 云数据库 / 云存储 / 云支付）实现的在线课程售卖小程序，包含学员端与管理端。

## 功能概览

**学员端**

- 首页：搜索框 + 分类筛选 + 课程卡片列表（封面、标题、价格、已售人数），支持下拉刷新与上拉加载
- 课程详情：封面、标题、价格、图文详情、章节目录、「立即购买 / 开始学习」、分享给好友与朋友圈
- 我的课程：已购课程列表，进入学习页（视频播放 + 图文资料），记录上次学习章节
- 我的：头像昵称设置、我的课程、我的订单、管理员入口（仅白名单可见）
- 订单：按状态筛选，待支付订单可继续支付或取消

**管理端（openid 白名单）**

- 课程管理：发布 / 编辑课程（标题、封面、分类、价格、富文本详情、章节视频）、上架 / 下架、删除
- 分类管理：新建 / 删除分类
- 订单管理：订单列表、按状态筛选、按时间倒序分页
- 数据统计：总销售额、今日销售额、已支付 / 待支付订单数、课程数、用户数、课程销售 TOP5

## 目录结构

```
├── app.js / app.json / app.wxss        # 全局入口与样式
├── project.config.json                 # 已配置 cloudfunctionRoot
├── pages
│   ├── index                           # 首页（搜索/分类/列表）
│   ├── course-detail                   # 课程详情与购买
│   ├── my-courses                      # 我的课程
│   ├── study                           # 学习页（视频/图文）
│   ├── mine                            # 我的（登录、入口）
│   ├── orders                          # 我的订单
│   ├── admin                           # 管理后台（课程/订单/统计）
│   └── admin-course-edit               # 发布 / 编辑课程
├── components/navigation-bar           # 自定义导航栏（模板自带，未启用）
├── utils
│   ├── config.js                       # 环境 ID 等配置
│   ├── cloud.js                        # 云函数调用封装 + 各模块 API
│   ├── pay.js                          # wx.requestPayment 封装
│   ├── upload.js                       # 云存储上传封装
│   └── util.js                         # 金额 / 时间 / 订单状态格式化
└── cloudfunctions
    ├── user                            # 登录、资料更新
    ├── course                          # 课程列表、详情、已购课程、分类
    ├── order                           # 下单、支付、回调、订单列表
    └── admin                           # 课程/分类/订单管理与统计
```

## 部署步骤

### 1. 开通云开发

1. 用微信开发者工具打开本项目，确认 `project.config.json` 中的 `appid` 为你的小程序 AppID。
2. 点击工具栏「云开发」→ 开通，创建一个环境（记下环境 ID）。
3. 打开 `utils/config.js`，把 `envId` 填为你的环境 ID（留空则使用开发者工具当前默认环境，正式环境建议显式填写）。

### 2. 创建数据库集合

在云开发控制台 → 数据库，创建以下集合：

| 集合 | 说明 |
| --- | --- |
| `users` | 用户资料与已购记录（`purchased` 数组） |
| `courses` | 课程（含 `chapters` 章节数组） |
| `orders` | 订单 |
| `categories` | 分类 |

**权限设置**：四个集合统一设置为「所有用户不可读写」（自定义安全规则 `false`）。
所有读写均通过云函数完成，云函数具备管理端权限，不受该规则限制，因此客户端无法直接篡改价格或读取未购买的课程内容。

**建议索引**（提高查询效率）：

- `courses`：`status` + `createdAt`（组合）、`categoryId`
- `orders`：`_openid` + `status` + `createdAt`、`orderNo`（唯一）、`courseId`
- `users`：`_openid`（唯一）
- `categories`：`sort`

### 3. 部署云函数

在开发者工具中对 `cloudfunctions` 下的 **user / course / order / admin** 四个目录分别右键：

> 上传并部署：云端安装依赖

四个云函数都依赖 `wx-server-sdk`，已写入各自的 `package.json`。

### 4. 配置云函数环境变量

云开发控制台 → 云函数 → 选择函数 → 配置 → 环境变量：

| 变量 | 作用 | 示例 |
| --- | --- | --- |
| `ADMIN_OPENIDS` | 管理员 openid 白名单，英文逗号分隔，四个函数都需要配置 | `oAbCd1234,oEfGh5678` |
| `SUB_MCH_ID` | 微信支付子商户号（`order` 函数使用） | `1900009231` |
| `PAY_MOCK` | 联调开关，`true` 时下单后直接置为已支付（不调用真实支付） | `false` |
| `ENV_ID` | 云环境 ID，`order` 函数调用支付时需要，可留空自动取当前环境 | `your-env-id` |

> 未配置 `SUB_MCH_ID` 时，付费课程下单会提示「尚未配置支付商户号，请联系管理员」，免费课程（价格 0）仍可正常走通「下单 → 已支付 → 已购记录」。

获取自己的 openid：进入「我的」页面后，在云开发控制台 `users` 集合中查看新增记录的 `_openid` 字段，将其填入 `ADMIN_OPENIDS`，重新部署/保存配置后即可看到「管理后台」入口。

### 5. 配置微信支付（云开发统一收银台）

1. 在微信支付商户平台申请商户号，并在「产品中心」开通 **JSAPI 支付**。
2. 在小程序后台「微信支付」中完成商户号关联。
3. 在云开发控制台开通「云支付 / 微信支付」，将子商户号填入云函数环境变量 `SUB_MCH_ID`。
4. `order` 云函数的支付回调函数名固定为 `order`（`PAY_CALLBACK_FUNCTION`），无需额外配置。
5. 支付流程：
   - 前端点击购买 → 云函数 `order.create` 创建 `orders` 记录（`status: pending`）
   - 云函数调用 `cloudPay.unifiedOrder` 返回支付参数 → 前端 `wx.requestPayment`
   - 微信支付回调进入 `order` 云函数的 `handleNotify`，把订单置为 `paid`，写入 `users.purchased` 并累加课程销量
   - 前端支付成功后调用 `order.confirm`（`cloudPay.queryOrder`）做一次兜底校验，避免回调延迟

联调阶段可设置 `PAY_MOCK=true` 跳过真实支付。

### 6. 初始化数据

1. 用管理员微信登录小程序，进入「管理后台 → 课程管理」，先「+ 新建」分类（如「前端」「云开发」）。
2. 点击「+ 发布课程」，填写标题、上传封面、选择分类、填写价格（元，0 表示免费）、富文本详情。
3. 在章节列表中点击「上传录制视频」，可从相册一次性选择多个录制好的视频（最多 9 个），每个视频自动生成一节课；也可以「+ 添加章节」手动逐节填写标题并上传视频。不传视频的章节会展示课程图文资料。
4. 保存后课程默认上架，学员端首页即可看到。

## 安全设计说明

- 所有写操作（下单、改资料、课程/订单/分类管理）均走云函数，客户端不直接写数据库。
- 管理端云函数统一校验 `ADMIN_OPENIDS`，非白名单用户调用直接返回「无管理权限」。
- 课程内容（图文详情、章节视频 fileID）在 `course.detail` 中按购买状态脱敏：未支付 / 未购买用户拿不到 `detail` 与 `videoFileID`，无法播放。
- 未上架课程仅已购用户与管理员可访问。
- 支付金额以课程价格（分）为准，不接受前端传参，避免篡改。
- 订单支付回调幂等：已支付订单重复回调不会重复发放课程或重复累加销量。

## 数据结构

```js
// users
{ _openid, nickName, avatarUrl, purchased: [{ courseId, orderId, createdAt }], createdAt, updatedAt }

// courses
{
  title, cover, categoryId, categoryName,
  price, originalPrice,            // 单位：分
  summary, detail,                 // detail 为富文本 HTML
  chapters: [{ title, videoFileID, sort }],
  chapterCount, sales, status,     // status: on | off
  createdAt, updatedAt
}

// orders
{
  _openid, orderNo, courseId, courseTitle, courseCover,
  amount,                          // 单位：分
  status,                          // pending | paid | cancelled
  transactionId, paidAt, createdAt, updatedAt
}

// categories
{ name, sort, createdAt }
```

## 常见问题

- **课程详情页图文不显示**：确认当前用户已购买（或课程价格为 0），未购买时内容会被脱敏。
- **支付调起失败**：检查 `SUB_MCH_ID`、云支付是否开通、商户号是否与小程序关联；联调可先用 `PAY_MOCK=true`。
- **看不到管理后台**：`ADMIN_OPENIDS` 必须配置在 `user` / `admin` 云函数上，修改后需重新部署或等待配置生效。
- **富文本中的图片**：当前富文本编辑器内不支持直接上传图片，建议用封面 + 文字排版；如需课程长图，可将图片上传到云存储后在详情中以上传的 fileID 拼接。
- **视频体积**：章节视频上传到云存储，建议先在后台压缩，单文件不超过 100MB，避免学员端加载过慢。

## 后续可扩展

- 课程评价与问答
- 优惠券 / 拼团 / 分销
- 学习进度同步到云端（当前使用本地缓存记录章节）
- 订单超时自动取消（云函数定时触发器）
