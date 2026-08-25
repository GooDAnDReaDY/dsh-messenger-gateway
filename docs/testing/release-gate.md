# Release gate (обязательно)

Код **не мержится и не деплоится**, пока не пройдены все пункты.

## Блокеры

1. `npm test` — все unit-тесты зелёные
2. `npm run test:load` — плагин загружается с реальными DSH-зависимостями
3. После install + restart: `GET /dsh-messenger-gateway/status` → `running: true`
4. Любой красный пункт = **стоп**

## Инцидент 25.08.2026

`z.enum` не существует в schemastery → unit-тесты прошли, prod упал. `test:load` ловит это до deploy.

## Деплой

```bash
dsh plugin --profile web remove @goodandready/dsh-messenger-gateway
dsh plugin --profile web add file:/path/to/plugin
sudo systemctl restart dsh-web.service
curl -s http://127.0.0.1:3080/dsh-messenger-gateway/status
```
