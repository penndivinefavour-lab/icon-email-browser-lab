# ICON Email & Browser Lab — Quick Start Guide

## 项目简介
ICON Email & Browser Lab 是一个本地优先的桌面/网页应用，用于管理邮件身份、授权收件箱、OTP/验证码解析、隔离浏览器配置（Playwright）、QA 测试自动化和活动日志记录。

**技术栈**: TypeScript + Vite + React, SQLite via sql.js (WebAssembly)

## 快速启动

### 1. 安装依赖
```bash
npm install
```

### 2. 初始化数据库
```bash
npm run db:migrate
npm run db:seed
```

### 3. 启动开发服务器
```bash
npm run dev
```
访问 http://localhost:3000

## 架构概览

### 包结构
- `packages/database/` — 数据库抽象层（sql.js，兼容 Node.js 和浏览器）
- `packages/email/` — 邮件提供商抽象（支持 Mock/IMAP/Gmail/Outlook）
- `packages/browser/` — Playwright 浏览器配置管理
- `packages/automation/` — QA 测试自动化工具
- `packages/shared/` — 共享工具函数（CSV、活动日志等）
- `apps/web/` — Vite + React 前端应用

### 核心功能
1. **身份管理**: 创建和管理邮件身份（Email, 显示名称, 提供商）
2. **邮箱管理**: 关联邮箱账号到身份，模拟收邮
3. **OTP 解析**: 从邮件中提取验证码（6位数字）
4. **浏览器配置**: 创建隔离的 Playwright 浏览器配置
5. **会话跟踪**: 记录浏览器会话历史
6. **自动化测试**: 运行和记录测试用例
7. **活动日志**: 审计所有系统操作

## 环境要求
- Node.js >= 18
- npm >= 9
- 可选：Playwright（用于浏览器自动化测试）

## 开发规范
- 使用 ESM `.ts` 导入（带路径别名）
- TypeScript 严格模式
- 所有 imports 使用 `@shared/*`, `@database/*` 等别名
- 测试使用 `npx tsx --test <file>`

## 安全须知
- ⚠️ 第三方凭据存储在 `.env` 文件中（已 gitignore）
- ⚠️ 绝不提交包含凭据的文件
- ⚠️ 不绕过任何第三方的注册限制或验证系统
- ⚠️ 仅用于本地测试和学习目的

## 许可证
MIT