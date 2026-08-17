# 对战中继服务(可选部署)

《驾考女武神》线上对战模式的 WebSocket 房间中继。**纯转发、不理解游戏语义**:
首个加入房间的玩家为宿主(浏览器内跑战斗引擎),第二位为客机,服务器只做
房间配对、消息转发与基础限速。不部署本服务不影响单机游戏。

游戏客户端默认连接 `wss://当前域名/ws`(同域推导),可用 `?pvp=ws://地址` 覆盖。

## 本机运行

```bash
cd server
npm install
npm start            # 监听 8787
```

开发调试(游戏跑在 localhost:3000):两个浏览器窗口打开
`http://localhost:3000/?pvp=ws://localhost:8787` 对打。

## Docker 部署(推荐)

```bash
cd server
docker compose up -d       # 仅绑定 127.0.0.1:8787
```

反向代理由部署者自行配置(把 `/ws` 路由到 `127.0.0.1:8787`):

**nginx**(注意 WebSocket Upgrade 头):

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
}
```

**Caddy**:

```caddyfile
你的域名 {
    handle /ws* {
        reverse_proxy 127.0.0.1:8787
    }
    # 前端静态(可选,同机部署时):
    # handle { root * /path/to/out; file_server }
}
```

> 注意:游戏页面经 HTTPS 提供时,浏览器禁止连接明文 `ws://`,必须走 `wss://`(即反代需配 TLS)。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8787` | 监听端口 |
| `PVP_ALLOWED_ORIGINS` | 空(不校验) | 逗号分隔的允许页面来源,生产建议设置,如 `https://你的域名` |

## 内置防护

- 房码 4 位去易混字符(无 0/O/1/I/L),约 81 万组合;
- 每连接消息 ≤ 10 条/秒、载荷 ≤ 8KB;
- 每 IP 建房/加入 ≤ 10 次/分钟;
- 任一方断开即拆房(对局作废);空转房间 10 分钟回收;30s 心跳剔除死连接。
