# CC98AI+

面向浙江大学 CC98 论坛的信息发现与订阅提醒浏览器插件。

## 项目定位

我们从日常使用 CC98 的场景出发，发现帖子和回复中的信息比较分散，用户需要反复组合关键词、阅读大量楼层，才能找到真正有用的内容；对于持续关注的话题，用户还需要反复手动查看新帖。

CC98AI+ 通过浏览器插件和后端服务解决这两个问题：

- **AI 搜索**：在浏览器中理解用户问题，调用 CC98 搜索接口，阅读相关帖子和回复，并生成带来源的总结。
- **订阅提醒**：后端定时扫描 CC98 新帖，匹配用户订阅，将结果保存到通知列表，并通过邮箱或用户配置的钉钉机器人提醒。

## 目录

```text
frontend/       Chrome / Edge 浏览器插件
backend/        FastAPI 订阅提醒后端
deploy/         Docker Compose 和 Nginx 部署文件
docs/           需求发现、产品设计和部署记录
```

## 本地开发

### 前端

打开 `frontend/`，在 Chrome 或 Edge 的扩展程序页面开启开发者模式，选择「加载已解压的扩展程序」。

AI 搜索主要运行在浏览器中，用户自己的 CC98 登录状态和 LLM API Key 不上传到本项目后端。

### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

当前阶段继续使用 SQLite。数据库文件应放在持久化目录中，不提交到 Git。

## 部署原则

- 后端使用 Docker Compose 运行；
- SQLite 使用 Docker volume 持久化；
- Nginx 负责反向代理；
- CC98 访问是否需要 RVPN，需要在目标服务器上实际测试；
- RVPN 是服务器访问 CC98 的网络通道，不是浏览器插件安装条件；
- 邮箱、CC98 服务账号和其他密钥只通过服务器环境变量配置。

## 安装插件

从 GitHub 下载仓库压缩包后，进入 `frontend/` 目录，在 `chrome://extensions/` 中加载该目录。后续可以单独发布只包含 `frontend/` 的 Release 压缩包，保持原来的安装方式。

## 项目成员

- 付江樊
- 竺子豪
- 王子欣

