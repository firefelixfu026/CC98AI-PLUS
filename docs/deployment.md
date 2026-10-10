# 部署说明

## 服务器目录

建议使用独立目录，不要复用已有项目目录：

```text
/opt/cc98ai-plus/
├─ backend/
├─ frontend/
├─ deploy/
└─ data/
```

## 后端部署

1. 在 `backend/` 中复制 `.env.example` 为 `.env`。
2. 填入新的 CC98 服务账号、SMTP 配置和管理员 Token。
3. 在项目根目录执行：

```bash
mkdir -p data
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml ps
curl http://127.0.0.1:18000/api/v1/health
```

SQLite 数据保存在宿主机的 `data/` 目录中。不要把这个目录提交到 Git。

## Systemd fallback

If Docker image downloads are unavailable, deploy with the server's Python 3.10 runtime:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cp deploy/cc98aiplus.service /etc/systemd/system/cc98aiplus.service
systemctl daemon-reload
systemctl enable --now cc98aiplus
```

Set `DATABASE_URL=sqlite:////opt/CC98AIPLUS/data/cc98_watch.db` in `backend/.env`
before starting the service.

## Nginx

将 `nginx-cc98ai.conf.example` 复制为一个新的站点配置文件，填写实际域名或服务器 IP，然后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

不要覆盖服务器上已有的其他站点配置。

## RVPN 检查

RVPN 不是插件安装条件，只影响后端服务器能否访问 CC98。部署后先检查：

```bash
curl -I https://api.cc98.org
curl -I https://openid.cc98.org
```

如果直连可用，不需要额外配置 RVPN；如果超时，再根据实际 RVPN 客户端或路由方式配置服务器网络。

