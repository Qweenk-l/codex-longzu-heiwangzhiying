# GitHub备份与恢复

用户指定中文名称：codex-龙族黑王之影。GitHub仓库名只能使用ASCII字母、数字、点、连字符和下划线，因此使用对应拼音名称。

- 私有仓库：https://github.com/Qweenk-l/codex-longzu-heiwangzhiying
- 远端名称：`origin`
- 默认备份分支：`codex/stage-one`，沿用本地主程序分支。
- 备份根目录：本项目的`05-游戏程序`，包含源码、序章至第十三章运行JSON、剧情构建快照、旧版本校验包、构建脚本、测试、设计与接入说明、依赖锁文件和Git提交历史。
- 排除：`node_modules`、`dist`、临时测试报告、`.env`及本地配置；浏览器里的个人存档不属于Git文件，需在游戏中单独导出。
- 主程序目录之外的Word原稿、项目总进度表、UI设计图片／动画／独立预览不在本次备份范围。项目进度仍只维护上级目录中的唯一总表。

## 恢复并运行

使用有权访问此私有仓库的GitHub账号，安装Git和Node.js 24.x后执行：

```powershell
git clone https://github.com/Qweenk-l/codex-longzu-heiwangzhiying.git
cd codex-longzu-heiwangzhiying
npm.cmd ci
npm.cmd run build
npm.cmd run dev -- --port 5173 --strictPort
```

打开`http://127.0.0.1:5173/`。需要恢复个人游玩进度时，在游戏中导入此前导出的存档文件。

`npm.cmd run content:build`只读取仓库内的`content-source`，可以重建运行剧情。完整测试中的原稿对照检查仍依赖本机上级`01-剧情文档`中的审阅文件；仅克隆主程序时不具备这部分外部资料。相关测试位置为`tests/revisions-september-six.test.ts`、`tests/chapters-six-nine.test.ts`、`tests/chapters-ten-thirteen.test.ts`。浏览器测试默认使用Microsoft Edge。备份没有为绕过资料缺失而降低测试要求。

## 后续同步

本次是一次Git提交与推送，未配置定时自动备份。后续有新改动时，检查变更范围后提交，再推送到`origin`；`git status`可检查当前工作区及与远端的同步状态。仓库权限保持私有。
