// Canonical Chinese (zh) locale dictionary
export const zh = {
  // Command descriptions
  'cmd.help': '显示帮助信息',
  'cmd.new': '开始新会话',
  'cmd.stop': '中断当前回答',
  'cmd.model': '交互式模型选择器',
  'cmd.role': '切换智能体角色/人设',
  'cmd.rewind': '回退最近N轮对话',
  'cmd.fork': '将会话派生到新分支',
  'cmd.export': '导出历史记录为Markdown',
  'cmd.skills': '列出当前可用工具与技能',
  'cmd.files': '工作区文件浏览器',
  'cmd.get': '从工作区下载文件',
  'cmd.remind': '设置提醒或定时器',
  'cmd.status': '查看网关与模型状态',
  'cmd.top': '查看系统资源（内存、运行时间）',
  'cmd.keyboard': '开关快捷操作键盘',
  'cmd.voice': '设置语音回复模式',
  'cmd.tts': '在此聊天开关语音朗读',
  'cmd.mute': '在此聊天静音通知',
  'cmd.unmute': '在此聊天恢复通知',
  'cmd.whoami': '显示你的用户ID',
  'cmd.pair': '批准配对申请码',
  'cmd.sethome': '设置主通知频道',
  'cmd.setalert': '设置告警通知目标',
  'cmd.bind': '绑定预设或人设到论坛话题',
  'cmd.preset': '查看或切换智能体预设',
  'cmd.cron': '配置定时周期性任务报告',

  // Bot replies & statuses
  'msg.start': '网关已连接。请向智能体发送消息。发送 /help 查看命令。',
  'msg.steer_added': '↪️ 已追加到当前回答',
  'msg.turn_stopped': '回答已中断。',
  'msg.no_active_session': '未找到活跃会话。',
  'msg.unknown_command': '未知命令 {cmd}。发送 /help',
  'msg.not_allowed': '访问受限。请联系管理员将您的ID加入白名单。',
  'msg.pairing_requested': '需要访问配对。\n您的ID: {userId}\n配对码: {code}\n\n管理员请向机器人发送：\n/pair {code}',
  'msg.pairing_rate_limit': '配对码已发出，请稍候或联系管理员。',
  'msg.pairing_approved': '✅ 用户 {userId} 已成功授权！',
  'msg.pairing_invalid': '配对码无效或已过期。',
  'msg.muted_on': '此聊天通知：已静音 (/unmute)',
  'msg.muted_off': '此聊天通知：已开启',
  'msg.no_response': '(无回复)',
  'msg.agent_error': '智能体错误: {code}: {message}',
  'msg.exception': '内部处理异常: {message}',

  // Photo & media
  'photo.received_one': '已收到图片。请输入您的问题 — 例如：“图片中有什么？”',
  'photo.received_many': '已收到 {count} 个附件。请输入您的问题。',
  'photo.hint_photo': '[附加图片]',
  'photo.hint_photos': '[附加了 {count} 张图片]',
  'doc.hint': '[附加文件: {name}]',

  // Interactive buttons & ask
  'ask.confirm_title': '⚠️ 需要授权确认\n工具: <code>{tool}</code>{reason}',
  'ask.allow_once': '✅ 允许单次',
  'ask.allow_session': '🛡️ 本会话始终允许',
  'ask.deny': '❌ 拒绝',
  'ask.chose': '已选择: {choice}',
  'ask.done': '完成',
  'ask.cancel': '取消',
  'ask.canceled': '已取消',
  'ask.expired': '交互已超时，请重新发起。',
  'ask.other_chat': '该按钮属于其他聊天',

  // Model selector
  'model.title': '🤖 <b>选择服务商：</b>',
  'model.current': '当前: <code>{current}</code>',
  'model.provider_models': '🤖 <b>服务商:</b> <code>{provider}</code>\n请选择模型 (第 {page}/{total} 页):',
  'model.no_models': '该服务商暂无可用的模型',
  'model.switched': '✅ 模型已成功切换至: <b>{provider}/{model}</b>',

  // Personas & Presets
  'persona.title': '🎭 <b>可用角色与人设:</b>',
  'persona.usage': '切换角色: <code>/role coder</code> (或 /role reset)',
  'persona.reset': '🎭 角色已重置为默认 (Default)。',
  'persona.switched': '🎭 角色已切换为: {icon} <b>{name}</b>\n{description}',
  'persona.unknown': '未知角色 "{target}"。列表请见: /role list',
  'persona.bound_topic': '📌 话题已绑定到{kind}: <b>{name}</b>',

  // Builtin persona descriptions
  'persona.default.name': '默认',
  'persona.default.desc': '通用智能助手，回答平衡清晰',
  'persona.coder.name': '开发者',
  'persona.coder.desc': '资深全栈工程师，直奔代码核心',
  'persona.writer.name': '文案编辑',
  'persona.writer.desc': '专业编辑润色，文笔优美流畅',
  'persona.analyst.name': '分析师',
  'persona.analyst.desc': '结构化逻辑拆解，深度数据分析',
  'persona.concise.name': '极简',
  'persona.concise.desc': '极速短促回复，1-2句话答复',

  // File explorer & export
  'files.title': '📁 <b>工作区路径:</b> <code>{path}</code>\n文件总计: {count}\n\n',
  'files.empty': '📁 目录为空: <code>{path}</code>',
  'files.download_hint': '\n下载文件命令: <code>/get &lt;path&gt;</code>',
  'files.not_found': '未找到文件: {path}',
  'export.title': '📄 对话导出 ({count} 条消息):',
  'export.empty': '会话为空，无消息可导出。',

  // Reminders & Cron
  'remind.scheduled': '⏰ 提醒已设置在 {time} ({duration} 后):\n{text}',
  'remind.invalid': '时间格式错误。例如: /remind 10m 检查构建',
  'remind.prefix': '⏰ <b>[提醒]</b>\n{text}',
  'cron.scheduled': '⏱️ 定时任务已配置: <code>{id}</code>\n周期表达式: <code>{schedule}</code>\n指令: {prompt}',
  'cron.list_title': '⏱️ <b>当前定时任务列表:</b>\n',
  'cron.none': '暂无活动的定时任务。',
  'cron.cancelled': '✅ 定时任务已取消: <code>{id}</code>',
  'cron.prefix': '⏱️ <b>[定时报告: {id}]</b>\n',

  // Mirror & Forum
  'mirror.created': '🪞 <b>[DSH 会话镜像]</b>\n会话ID: <code>{sessionId}</code>\n标题: <b>{title}</b>\n此话题消息与 DSH 双向同步。',
}
