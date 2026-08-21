# Sideleaf

A quiet co-reading space for reading side by side without forced synchronization.

当前版本支持从本机导入未加密的 EPUB、TXT 与 Markdown，并在移动端保留阅读进度、双人阅读线、原句对话和章节札记。

书架页可以导出带 SHA-256 完整性校验的全量本地备份；书架中的内置书与导入书使用同一份书库清单，正文、目录和阅读数据都会进入备份。恢复前会预览、校验；恢复失败会自动回滚，成功后也保留一次即时撤销机会。

连接私有 Sideleaf Core 后，阅读线、原句对话、章节札记与「峥来读」请求会在本机落盘后增量推送；离线不会阻断阅读，恢复网络后继续补送。应用打开、回到前台或本机发生变化时也会从 Core 拉回峥的阅读线、批注回复与请求状态，让 MCP 完成的共读结果回到手机。连接时先由 Core 生成十分钟有效的一次性配对码，再回到实际安装在桌面的 Sideleaf，在「备份」面板粘贴配对，避免凭证落入聊天应用或浏览器的另一份本机存储。公开前端不包含 Railway 主 token，设备凭证也不会进入完整备份。

Preview: https://via-wan.github.io/Sideleaf/
