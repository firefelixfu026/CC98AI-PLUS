# CC98 AI+

面向浙江大学师生的 CC98 智能搜索与新帖订阅提醒浏览器插件。

当前插件版本：`0.1.4`（内部测试）

## 功能

- **AI 搜索**：把自然语言问题拆成检索词，搜索 CC98 帖子和回复，生成带原帖链接的总结。
- **订阅提醒**：后端持续扫描全站新帖，命中订阅表达式后保存通知记录，并可通过邮箱或钉钉提醒。
- **主题跟随**：插件会读取当前 CC98 主题的主要颜色，让面板、弹窗和设置页保持一致的视觉风格。
- **隐私边界**：用户的 CC98 Token 和 LLM API Key 只保存在本地浏览器中，不上传到项目后端。

## 快速安装

1. 在 GitHub 页面点击 `Code -> Download ZIP`，下载并解压仓库。
2. 打开 Chrome 或 Edge 的扩展程序管理页，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择仓库中的 `frontend/` 目录。
4. 打开或刷新 [CC98](https://www.cc98.org)，页面右下角会出现带放大镜图标的圆形入口。该入口可以拖动，点击后打开 CC98 AI+ 面板。

只使用 AI 搜索时无需登录 CC98 AI+；在完整设置页中填写自己的 LLM 服务地址、模型和 API Key 即可。订阅、通知记录以及邮箱或钉钉提醒需要先使用浙大邮箱验证码登录。

完整使用说明见 [前端 README](frontend/README.md)。

## 订阅表达式

订阅使用简单的表达式描述匹配条件：

- 空格表示「且」；
- 半角 `/` 表示「或」；
- 每个关键词至少 2 个字符；
- 表达式总长度不超过 255 个字符。

例如：

```text
微积分/微甲/vjf 历年卷 资料
```

表示帖子需要同时出现「历年卷」和「资料」，并且「微积分、微甲、vjf」中至少出现一个。一个账号最多创建 10 条订阅，暂停的订阅也计入总数。

同一篇帖子命中多条表达式时，通知列表只保留一条帖子记录；邮箱和钉钉消息会按表达式分组列出对应帖子，方便查看命中关系。

## 项目结构

```text
frontend/       Chrome / Edge 浏览器插件
backend/        FastAPI 订阅提醒后端
deploy/         Docker Compose 和 Nginx 部署文件
docs/           产品设计、接口和部署文档
```

AI 搜索主要在浏览器侧完成；后端负责邮箱登录、订阅保存、新帖扫描、规则匹配、通知记录和外部推送。两条功能链路相互独立。

## 本地开发

### 前端

前端无需构建，直接在扩展程序管理页加载 `frontend/`。修改代码后，需要先在扩展程序管理页点击「重新加载」，再刷新已经打开的 CC98 页面。

### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Windows PowerShell 中激活虚拟环境可使用：

```powershell
.\.venv\Scripts\Activate.ps1
```

当前后端使用 SQLite，数据库文件应放在持久化目录中，不提交到 Git。

## 部署

- 后端使用 Docker Compose 运行；
- SQLite 通过 Docker volume 持久化；
- Nginx 负责 HTTPS 和反向代理；
- 服务器通过 ZJU Connect / RVPN 访问校内 CC98 接口；
- 邮箱、CC98 服务账号和管理员 Token 等密钥仅通过服务器环境变量配置。

部署步骤见 [docs/deployment.md](docs/deployment.md)，后端设计与运行机制见 [backend/README.md](backend/README.md)。

## 项目成员

- 付江樊
- 竺子豪
- 王子欣

## 开源协议

本项目采用 [MIT License](backend/LICENSE)。
